import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import MapView, { Polyline, Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import type { Camera, Region } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../../theme';
import {
  geocodeAddress,
  reverseGeocode,
  fetchRoutes,
  suggestPlace,
} from '../../../services/routing';
import type { GeocodedPlace, RouteOption } from '../../../services/routing';

const { width: W } = Dimensions.get('window');
const CARD_W = Math.min(W - 72, 272);
const BLUE = '#007AFF';
const GREY_ROUTE = '#7A91B0';
const GLASS_BORDER = 'rgba(255,255,255,0.11)';

type Phase = 'idle' | 'loading' | 'results' | 'navigating';
type Coord = { latitude: number; longitude: number };

const DEFAULT_REGION: Region = {
  latitude: 43.7000,
  longitude: -79.4163,
  latitudeDelta: 0.38,
  longitudeDelta: 0.56,
};

const CAM_DRIVING: Camera = {
  center: { latitude: 43.7200, longitude: -79.4200 },
  pitch: 52,
  heading: 88,
  altitude: 3200,
  zoom: 13.5,
};

// ─── Navigation utilities ─────────────────────────────────────────────────────

function haversineDist(a: Coord, b: Coord): number {
  const R = 6371000;
  const dLat = (b.latitude - a.latitude) * (Math.PI / 180);
  const dLon = (b.longitude - a.longitude) * (Math.PI / 180);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const x =
    sinLat * sinLat +
    Math.cos(a.latitude * (Math.PI / 180)) * Math.cos(b.latitude * (Math.PI / 180)) * sinLon * sinLon;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

function fmtDur(secs: number): string {
  const mins = Math.round(secs / 60);
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function maneuverIcon(type: string, modifier?: string): string {
  if (type === 'arrive') return 'flag-outline';
  if (type === 'depart') return 'navigate-outline';
  if (type === 'roundabout' || type === 'rotary' || type === 'exit roundabout' || type === 'exit rotary') return 'refresh-outline';
  if (type === 'merge') return 'git-merge-outline';
  if (modifier === 'uturn') return 'return-down-back-outline';
  if (modifier === 'left' || modifier === 'sharp left') return 'arrow-back-outline';
  if (modifier === 'right' || modifier === 'sharp right') return 'arrow-forward-outline';
  if (modifier === 'slight left') return 'chevron-back-outline';
  if (modifier === 'slight right') return 'chevron-forward-outline';
  return 'arrow-up-outline';
}

// ─── MapsScreen ───────────────────────────────────────────────────────────────

export default function MapsScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const toInputRef = useRef<TextInput>(null);

  // Phase
  const [phase, setPhase] = useState<Phase>('idle');

  // Input text (display values)
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');

  // Resolved coordinates (set when user picks a suggestion or uses GPS)
  const [fromCoord, setFromCoord] = useState<Coord | null>(null);
  const [toCoord, setToCoord] = useState<Coord | null>(null);

  // Labels shown in the results header
  const [originLabel, setOriginLabel] = useState('');
  const [destLabel, setDestLabel] = useState('');

  // Autocomplete state
  const [suggestionsFrom, setSuggestionsFrom] = useState<GeocodedPlace[]>([]);
  const [suggestionsTo, setSuggestionsTo] = useState<GeocodedPlace[]>([]);
  const [loadingFrom, setLoadingFrom] = useState(false);
  const [loadingTo, setLoadingTo] = useState(false);

  // Debounce timers
  const timerFrom = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerTo = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Routes
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState<'explore' | 'driving'>('explore');

  // Navigation state
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [remainingDistM, setRemainingDistM] = useState(0);
  const [remainingDurS, setRemainingDurS] = useState(0);
  const [distToNextStep, setDistToNextStep] = useState(0);
  const locationSubRef = useRef<{ remove: () => void } | null>(null);
  const currentStepIdxRef = useRef(0);

  const recommendedRoute = routes.find(r => r.isRecommended);
  const navRoute = phase === 'navigating' ? routes.find(r => r.id === selectedId) : null;
  const navStep = navRoute?.steps[currentStepIdx] ?? null;

  // ── Text change handlers (debounced autocomplete) ─────────────────────────

  function handleFromChange(text: string) {
    setFromText(text);
    setFromCoord(null); // user is typing freely, invalidate any picked coord
    if (timerFrom.current) clearTimeout(timerFrom.current);
    if (text.trim().length < 2) { setSuggestionsFrom([]); return; }
    setLoadingFrom(true);
    timerFrom.current = setTimeout(async () => {
      const results = await suggestPlace(text);
      setSuggestionsFrom(results);
      setLoadingFrom(false);
    }, 400);
  }

  function handleToChange(text: string) {
    setToText(text);
    setToCoord(null);
    if (timerTo.current) clearTimeout(timerTo.current);
    if (text.trim().length < 2) { setSuggestionsTo([]); return; }
    setLoadingTo(true);
    timerTo.current = setTimeout(async () => {
      const results = await suggestPlace(text);
      setSuggestionsTo(results);
      setLoadingTo(false);
    }, 400);
  }

  // ── Suggestion selection ──────────────────────────────────────────────────

  function handlePickFrom(place: GeocodedPlace) {
    setFromText(place.name);
    setFromCoord(place.coordinate);
    setSuggestionsFrom([]);
    setLoadingFrom(false);
    // Auto-advance focus to destination field
    setTimeout(() => toInputRef.current?.focus(), 50);
  }

  function handlePickTo(place: GeocodedPlace) {
    setToText(place.name);
    setToCoord(place.coordinate);
    setSuggestionsTo([]);
    setLoadingTo(false);
  }

  // ── Current location ──────────────────────────────────────────────────────

  async function handleCurrentLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Location access is needed to use your current position.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const coord: Coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    const name = await reverseGeocode(coord);
    setFromText(name);
    setFromCoord(coord);
    setSuggestionsFrom([]);
  }

  // ── Find routes ───────────────────────────────────────────────────────────

  async function handleFindRoutes() {
    if (!fromText.trim() || !toText.trim()) {
      Alert.alert('Missing info', 'Enter both an origin and a destination.');
      return;
    }
    Keyboard.dismiss();
    setSuggestionsFrom([]);
    setSuggestionsTo([]);
    setPhase('loading');

    try {
      // Use picked coordinates when available; fall back to geocoding typed text
      let origin = fromCoord;
      let dest = toCoord;

      if (!origin) {
        const p = await geocodeAddress(fromText);
        if (!p) throw new Error('origin_not_found');
        origin = p.coordinate;
        setOriginLabel(p.name);
      } else {
        setOriginLabel(fromText);
      }

      if (!dest) {
        const p = await geocodeAddress(toText);
        if (!p) throw new Error('dest_not_found');
        dest = p.coordinate;
        setDestLabel(p.name);
      } else {
        setDestLabel(toText);
      }

      const result = await fetchRoutes(origin, dest);
      if (!result.length) throw new Error('no_routes');

      setRoutes(result);
      const def = result.find(r => r.isRecommended) ?? result[0];
      setSelectedId(def.id);
      setPhase('results');

      const allCoords = result.flatMap(r => r.coords);
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(allCoords, {
          edgePadding: { top: 120, right: 40, bottom: 360, left: 40 },
          animated: true,
        });
      }, 350);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'origin_not_found' || msg === 'dest_not_found') {
        Alert.alert('Location not found', 'Could not find that address. Try being more specific (e.g. "Toronto, ON").');
      } else if (msg === 'no_routes') {
        Alert.alert('No routes', 'Could not calculate routes between these locations.');
      } else {
        Alert.alert('Error', 'Failed to fetch routes. Check your connection and try again.');
      }
      setPhase('idle');
    }
  }

  // ── Route selection ───────────────────────────────────────────────────────

  function handleSelectRoute(route: RouteOption) {
    if (route.id === selectedId) return;
    setSelectedId(route.id);
    Haptics.impactAsync(
      route.isRecommended ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );
  }

  // ── Mode toggle ───────────────────────────────────────────────────────────

  function handleToggleMode() {
    const next: 'explore' | 'driving' = mode === 'explore' ? 'driving' : 'explore';
    setMode(next);
    if (next === 'driving') {
      mapRef.current?.animateCamera(CAM_DRIVING, { duration: 900 });
    } else {
      mapRef.current?.fitToCoordinates(routes.flatMap(r => r.coords), {
        edgePadding: { top: 120, right: 40, bottom: 360, left: 40 },
        animated: true,
      });
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  function handleReset() {
    locationSubRef.current?.remove();
    locationSubRef.current = null;
    currentStepIdxRef.current = 0;
    setCurrentStepIdx(0);
    setPhase('idle');
    setRoutes([]);
    setSelectedId('');
    setMode('explore');
    mapRef.current?.animateToRegion(DEFAULT_REGION, 600);
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  async function handleStartNavigation() {
    const route = routes.find(r => r.id === selectedId);
    if (!route || !route.steps.length) return;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Location access is required for navigation.');
      return;
    }

    const totalDist = route.steps.reduce((s, st) => s + st.distanceM, 0);
    const totalDur = route.steps.reduce((s, st) => s + st.durationS, 0);
    currentStepIdxRef.current = 0;
    setCurrentStepIdx(0);
    setRemainingDistM(totalDist);
    setRemainingDurS(totalDur);
    setDistToNextStep(route.steps[0]?.distanceM ?? 0);
    setPhase('navigating');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const startCoord = route.steps[0]?.coordinate ?? route.coords[0];
    mapRef.current?.animateCamera(
      { center: startCoord, pitch: 52, altitude: 600, heading: 0 },
      { duration: 900 },
    );

    locationSubRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 8, timeInterval: 2000 },
      (loc) => {
        const userPos: Coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        const heading = loc.coords.heading ?? 0;

        mapRef.current?.animateCamera(
          { center: userPos, pitch: 52, altitude: 600, heading: heading > 0 ? heading : undefined },
          { duration: 400 },
        );

        const steps = route.steps;
        const idx = currentStepIdxRef.current;
        if (idx >= steps.length) return;

        const nextManeuver = steps[idx + 1] ?? steps[idx];
        const dist = haversineDist(userPos, nextManeuver.coordinate);
        setDistToNextStep(dist);

        // Advance to next step when within 40 m of the maneuver point
        if (dist < 40 && idx + 1 < steps.length) {
          const newIdx = idx + 1;
          currentStepIdxRef.current = newIdx;
          setCurrentStepIdx(newIdx);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          const rem = steps.slice(newIdx).reduce(
            (acc, st) => ({ d: acc.d + st.distanceM, t: acc.t + st.durationS }),
            { d: 0, t: 0 },
          );
          setRemainingDistM(rem.d);
          setRemainingDurS(rem.t);
        }

        // Arrival detection on the final step
        if (idx >= steps.length - 1) {
          const lastStep = steps[steps.length - 1];
          if (lastStep && haversineDist(userPos, lastStep.coordinate) < 50) {
            locationSubRef.current?.remove();
            locationSubRef.current = null;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Arrived!', 'You have reached your destination.', [
              { text: 'Done', onPress: handleEndNavigation },
            ]);
          }
        }
      },
    );
  }

  function handleEndNavigation() {
    locationSubRef.current?.remove();
    locationSubRef.current = null;
    currentStepIdxRef.current = 0;
    setCurrentStepIdx(0);
    setPhase('results');
    setTimeout(() => {
      mapRef.current?.fitToCoordinates(routes.flatMap(r => r.coords), {
        edgePadding: { top: 120, right: 40, bottom: 360, left: 40 },
        animated: true,
      });
    }, 350);
  }

  function midpoint(coords: Coord[]): Coord {
    return coords[Math.floor(coords.length / 2)] ?? coords[0];
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>

      {/* ── Always-on map ─────────────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT}
        initialRegion={DEFAULT_REGION}
        showsUserLocation
        showsCompass={false}
        rotateEnabled
        pitchEnabled
      >
        {routes.map((route) => {
          const active = route.id === selectedId;
          return (
            <React.Fragment key={route.id}>
              {active && (
                <Polyline
                  coordinates={route.coords}
                  strokeColor="rgba(0,122,255,0.22)"
                  strokeWidth={18}
                  lineCap="round"
                  lineJoin="round"
                />
              )}
              <Polyline
                coordinates={route.coords}
                strokeColor={active ? BLUE : GREY_ROUTE}
                strokeWidth={active ? 5 : 3}
                lineCap="round"
                lineJoin="round"
              />
            </React.Fragment>
          );
        })}

        {/* Best fuel economy badge — pinned to midpoint of recommended route */}
        {recommendedRoute && recommendedRoute.coords.length > 0 && (
          <Marker
            coordinate={midpoint(recommendedRoute.coords)}
            anchor={{ x: 0.5, y: 1.3 }}
            tracksViewChanges={false}
          >
            <View style={styles.recoBadge}>
              <Ionicons name="leaf" size={11} color={Colors.textInverse} />
              <Text style={styles.recoBadgeText}>Best Fuel Economy</Text>
            </View>
            <View style={styles.recoPointer} />
          </Marker>
        )}

        {/* Origin pin */}
        {phase === 'results' && routes[0]?.coords[0] && (
          <Marker coordinate={routes[0].coords[0]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={styles.pin}>
              <View style={[styles.pinCore, { backgroundColor: Colors.primary }]} />
            </View>
          </Marker>
        )}

        {/* Destination pin */}
        {phase === 'results' && routes[0]?.coords.at(-1) && (
          <Marker coordinate={routes[0].coords.at(-1)!} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={styles.pin}>
              <View style={[styles.pinCore, { backgroundColor: Colors.textMuted }]} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* ══════════════════ IDLE: Input panel ══════════════════════════════ */}
      {phase === 'idle' && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.inputWrap, { paddingBottom: insets.bottom + 8 }]}
        >
          {/* Use a plain View (no overflow:hidden) so suggestions aren't clipped */}
          <View style={styles.inputOuter}>
            <BlurView intensity={76} tint="dark" style={[StyleSheet.absoluteFillObject, styles.inputBlur]} />

            <View style={styles.inputCard}>
              {/* Title */}
              <View style={styles.inputTitle}>
                <Ionicons name="map-outline" size={17} color={Colors.primary} />
                <Text style={styles.inputTitleText}>Plan Your Route</Text>
              </View>

              {/* ── FROM field ────────────────────────────────────── */}
              <View style={styles.fieldRow}>
                <View style={[styles.fieldDot, { backgroundColor: Colors.primary }]} />
                <TextInput
                  style={styles.fieldInput}
                  placeholder="From — city, address, landmark…"
                  placeholderTextColor={Colors.textMuted}
                  value={fromText}
                  onChangeText={handleFromChange}
                  returnKeyType="next"
                  onSubmitEditing={() => toInputRef.current?.focus()}
                  autoCorrect={false}
                  autoCapitalize="words"
                />
                {loadingFrom && <ActivityIndicator size="small" color={Colors.textMuted} />}
              </View>

              {/* FROM suggestions */}
              {suggestionsFrom.length > 0 && (
                <SuggestionList
                  suggestions={suggestionsFrom}
                  onSelect={handlePickFrom}
                />
              )}

              <View style={styles.fieldSep} />

              {/* ── TO field ──────────────────────────────────────── */}
              <View style={styles.fieldRow}>
                <View style={[styles.fieldDot, { backgroundColor: Colors.textMuted }]} />
                <TextInput
                  ref={toInputRef}
                  style={styles.fieldInput}
                  placeholder="To — city, address, landmark…"
                  placeholderTextColor={Colors.textMuted}
                  value={toText}
                  onChangeText={handleToChange}
                  returnKeyType="search"
                  onSubmitEditing={handleFindRoutes}
                  autoCorrect={false}
                  autoCapitalize="words"
                />
                {loadingTo && <ActivityIndicator size="small" color={Colors.textMuted} />}
              </View>

              {/* TO suggestions */}
              {suggestionsTo.length > 0 && (
                <SuggestionList
                  suggestions={suggestionsTo}
                  onSelect={handlePickTo}
                />
              )}

              {/* Current location shortcut */}
              <TouchableOpacity style={styles.locBtn} onPress={handleCurrentLocation} activeOpacity={0.75}>
                <Ionicons name="locate-outline" size={14} color={Colors.primary} />
                <Text style={styles.locBtnText}>Use current location as origin</Text>
              </TouchableOpacity>

              {/* CTA */}
              <TouchableOpacity style={styles.ctaBtn} onPress={handleFindRoutes} activeOpacity={0.85}>
                <Ionicons name="git-branch-outline" size={16} color={Colors.textInverse} />
                <Text style={styles.ctaBtnText}>Find Routes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* ══════════════════ LOADING ════════════════════════════════════════ */}
      {phase === 'loading' && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <View style={styles.glass}>
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} />
            <View style={styles.loadingInner}>
              <ActivityIndicator color={Colors.primary} size="large" />
              <Text style={styles.loadingText}>Calculating routes…</Text>
              <Text style={styles.loadingSubText}>Comparing fuel costs & tolls</Text>
            </View>
          </View>
        </View>
      )}

      {/* ══════════════════ RESULTS ════════════════════════════════════════ */}
      {phase === 'results' && (
        <>
          {/* Header */}
          <View style={[styles.headerRow, { top: insets.top + 10 }]}>
            <TouchableOpacity style={styles.iconBtn} onPress={handleReset} activeOpacity={0.8}>
              <BlurView intensity={72} tint="dark" style={StyleSheet.absoluteFillObject} />
              <Ionicons name="arrow-back" size={18} color={Colors.textPrimary} />
            </TouchableOpacity>

            <View style={[styles.glass, styles.searchSummary]}>
              <BlurView intensity={72} tint="dark" style={StyleSheet.absoluteFillObject} />
              <View style={styles.searchSummaryInner}>
                <Ionicons name="navigate-circle-outline" size={15} color={Colors.primary} />
                <Text style={styles.searchOrigin} numberOfLines={1}>{originLabel}</Text>
                <Ionicons name="arrow-forward" size={11} color={Colors.textMuted} />
                <Text style={styles.searchDest} numberOfLines={1}>{destLabel}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.iconBtn} onPress={handleToggleMode} activeOpacity={0.8}>
              <BlurView intensity={72} tint="dark" style={StyleSheet.absoluteFillObject} />
              <Ionicons
                name={mode === 'driving' ? 'layers-outline' : 'navigate-outline'}
                size={17}
                color={Colors.textPrimary}
              />
              <Text style={styles.iconBtnLabel}>{mode === 'driving' ? '3D' : '2D'}</Text>
            </TouchableOpacity>
          </View>

          {/* Mode pill */}
          <View style={[styles.modePillWrap, { top: insets.top + 70 }]} pointerEvents="none">
            <View style={styles.modePill}>
              <View style={[styles.modeDot, { backgroundColor: mode === 'driving' ? BLUE : Colors.primary }]} />
              <Text style={styles.modePillText}>
                {mode === 'driving' ? 'Driving · 3D Perspective' : 'Explore · Overview'}
              </Text>
            </View>
          </View>

          {/* Route cards */}
          <View style={[styles.cardsWrap, { paddingBottom: insets.bottom + 8 }]}>
            <FlatList
              data={routes}
              keyExtractor={r => r.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={CARD_W + 12}
              decelerationRate="fast"
              contentContainerStyle={styles.cardsScroll}
              renderItem={({ item }) => (
                <RouteCard
                  route={item}
                  selected={item.id === selectedId}
                  onPress={() => handleSelectRoute(item)}
                />
              )}
            />
            <TouchableOpacity style={styles.startBtn} onPress={handleStartNavigation} activeOpacity={0.85}>
              <Ionicons name="navigate" size={16} color={Colors.textInverse} />
              <Text style={styles.startBtnText}>Start</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
      {/* ══════════════════ NAVIGATING ════════════════════════════════════ */}
      {phase === 'navigating' && navStep && (
        <>
          {/* Top instruction card */}
          <View style={[styles.navTopCard, { top: insets.top + 10 }]}>
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} />
            <View style={styles.navTopInner}>
              <View style={styles.navIconWrap}>
                <Ionicons
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  name={maneuverIcon(navStep.maneuverType, navStep.maneuverModifier) as any}
                  size={26}
                  color={Colors.textInverse}
                />
              </View>
              <View style={styles.navTextCol}>
                <Text style={styles.navInstruction} numberOfLines={2}>{navStep.instruction}</Text>
                {navStep.streetName ? (
                  <Text style={styles.navStreet} numberOfLines={1}>{navStep.streetName}</Text>
                ) : null}
              </View>
              <View style={styles.navDistBadge}>
                <Text style={styles.navDistText}>{fmtDist(distToNextStep)}</Text>
              </View>
            </View>
          </View>

          {/* Bottom ETA + End bar */}
          <View style={[styles.navFooterWrap, { paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.navFooterCard}>
              <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} />
              <View style={styles.navFooterInner}>
                <View style={styles.navEtaCol}>
                  <Text style={styles.navEtaTime}>{fmtDur(remainingDurS)}</Text>
                  <Text style={styles.navEtaDist}>{fmtDist(remainingDistM)} remaining</Text>
                </View>
                <TouchableOpacity style={styles.navEndBtn} onPress={handleEndNavigation} activeOpacity={0.85}>
                  <Text style={styles.navEndBtnText}>End</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </>
      )}

    </View>
  );
}

// ─── Suggestion list ──────────────────────────────────────────────────────────

function SuggestionList({
  suggestions,
  onSelect,
}: {
  suggestions: GeocodedPlace[];
  onSelect: (place: GeocodedPlace) => void;
}) {
  return (
    <View style={styles.suggestionList}>
      {suggestions.map((place, i) => (
        <TouchableOpacity
          key={`${place.name}-${i}`}
          style={[
            styles.suggestionItem,
            i < suggestions.length - 1 && styles.suggestionItemBorder,
          ]}
          // onPressIn fires before TextInput onBlur, preventing list from
          // disappearing before the tap registers
          onPressIn={() => onSelect(place)}
          activeOpacity={0.65}
        >
          <Ionicons name="location-outline" size={14} color={Colors.primary} style={styles.suggestionIcon} />
          <Text style={styles.suggestionText} numberOfLines={2}>{place.name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Route card ───────────────────────────────────────────────────────────────

function RouteCard({
  route,
  selected,
  onPress,
}: {
  route: RouteOption;
  selected: boolean;
  onPress: () => void;
}) {
  const mins = Math.round(route.durationS / 60);
  const distKm = (route.distanceM / 1000).toFixed(1);
  const timeStr = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;

  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <BlurView intensity={72} tint="dark" style={StyleSheet.absoluteFillObject} />

      <View style={styles.cardContent}>
        {route.isRecommended && (
          <View style={styles.recoBadgeCard}>
            <Ionicons name="leaf" size={11} color={Colors.textInverse} />
            <Text style={styles.recoBadgeCardText}>Best Fuel Economy</Text>
          </View>
        )}

        <View style={styles.cardLabelRow}>
          <View style={[styles.cardDot, { backgroundColor: selected ? BLUE : GREY_ROUTE }]} />
          <Text style={[styles.cardLabel, selected && styles.cardLabelActive]} numberOfLines={1}>
            {route.label}
          </Text>
          {route.isTollRoute && (
            <View style={styles.tollChip}>
              <Text style={styles.tollChipText}>Toll</Text>
            </View>
          )}
        </View>

        <Text style={[styles.cardTime, selected && styles.cardTimeActive]}>{timeStr}</Text>
        <Text style={styles.cardDist}>{distKm} km · {route.fuelL100km.toFixed(1)} L/100km</Text>

        <View style={styles.cardDivider} />

        <View style={styles.costRow}>
          <Ionicons name="flame-outline" size={12} color={Colors.textMuted} />
          <Text style={styles.costLabel}>Fuel</Text>
          <Text style={styles.costValue}>${route.fuelCostCAD.toFixed(2)}</Text>
        </View>
        {route.tollCostCAD > 0 && (
          <View style={styles.costRow}>
            <Ionicons name="card-outline" size={12} color={Colors.pending} />
            <Text style={[styles.costLabel, { color: Colors.pending }]}>Toll</Text>
            <Text style={[styles.costValue, { color: Colors.pending }]}>${route.tollCostCAD.toFixed(2)}</Text>
          </View>
        )}
        <View style={[styles.costRow, styles.costTotal]}>
          <Ionicons name="wallet-outline" size={12} color={selected ? Colors.primary : Colors.textSecondary} />
          <Text style={[styles.costLabel, { color: selected ? Colors.primary : Colors.textSecondary, fontWeight: FontWeight.bold }]}>
            Total
          </Text>
          <Text style={[styles.costValue, { color: selected ? Colors.primary : Colors.textPrimary, fontWeight: FontWeight.bold }]}>
            ${route.totalCostCAD.toFixed(2)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  glass: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    overflow: 'hidden',
  },

  // ── Input panel ──────────────────────────────────────────────────────────
  inputWrap: {
    position: 'absolute',
    bottom: 0,
    left: Spacing.base,
    right: Spacing.base,
  },
  // No overflow:hidden here so suggestion list isn't clipped
  inputOuter: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  // BlurView gets its own border radius to match inputOuter
  inputBlur: {
    borderRadius: 16,
  },
  inputCard: {
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  inputTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  inputTitleText: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },

  // Field row
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  fieldDot: {
    width: 10,
    height: 10,
    borderRadius: Radius.full,
    flexShrink: 0,
  },
  fieldInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.base,
    paddingVertical: Spacing.xs,
  },
  fieldSep: {
    height: 1,
    backgroundColor: GLASS_BORDER,
    marginLeft: 22,
  },

  // ── Suggestion list ───────────────────────────────────────────────────────
  suggestionList: {
    marginLeft: 22,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: 'rgba(17,17,28,0.96)',
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm + 1,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.xs,
  },
  suggestionItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: GLASS_BORDER,
  },
  suggestionIcon: {
    marginTop: 1,
    flexShrink: 0,
  },
  suggestionText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 18,
  },

  // ── Location + CTA ────────────────────────────────────────────────────────
  locBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  locBtnText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    marginTop: Spacing.xs,
    ...Shadow.green,
  },
  ctaBtnText: {
    color: Colors.textInverse,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },

  // ── Loading overlay ───────────────────────────────────────────────────────
  loadingOverlay: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
  },
  loadingInner: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  loadingText: {
    color: Colors.textPrimary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    marginTop: Spacing.xs,
  },
  loadingSubText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },

  // ── Results header ────────────────────────────────────────────────────────
  headerRow: {
    position: 'absolute',
    left: Spacing.base,
    right: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    flexShrink: 0,
  },
  iconBtnLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.4,
  },
  searchSummary: { flex: 1 },
  searchSummaryInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 3,
    gap: Spacing.xs + 1,
  },
  searchOrigin: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    flexShrink: 1,
  },
  searchDest: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    flexShrink: 1,
  },

  // ── Mode pill ─────────────────────────────────────────────────────────────
  modePillWrap: { position: 'absolute', alignSelf: 'center' },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(8,8,15,0.78)',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
  },
  modeDot: { width: 6, height: 6, borderRadius: Radius.full },
  modePillText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.2,
  },

  // ── Route cards ───────────────────────────────────────────────────────────
  cardsWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  cardsScroll: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.base,
    gap: 12,
  },
  card: {
    width: CARD_W,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: GLASS_BORDER,
    overflow: 'hidden',
    ...Shadow.md,
  },
  cardSelected: { borderColor: BLUE },
  cardContent: {
    padding: Spacing.base,
    gap: Spacing.xs + 1,
  },

  recoBadgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    marginBottom: Spacing.xs,
  },
  recoBadgeCardText: {
    color: Colors.textInverse,
    fontSize: 10,
    fontWeight: FontWeight.bold,
  },

  cardLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  cardDot: { width: 8, height: 8, borderRadius: Radius.full, flexShrink: 0 },
  cardLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    flexShrink: 1,
  },
  cardLabelActive: { color: Colors.textPrimary },
  tollChip: {
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderRadius: Radius.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tollChipText: { color: Colors.pending, fontSize: 9, fontWeight: FontWeight.bold },

  cardTime: {
    color: Colors.textMuted,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    lineHeight: 28,
  },
  cardTimeActive: { color: Colors.textPrimary },
  cardDist: { color: Colors.textMuted, fontSize: FontSize.xs, marginBottom: Spacing.xs },
  cardDivider: { height: 1, backgroundColor: GLASS_BORDER, marginVertical: Spacing.xs },

  costRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  costTotal: { marginTop: Spacing.xs },
  costLabel: { flex: 1, color: Colors.textSecondary, fontSize: FontSize.sm },
  costValue: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  // ── Map markers ───────────────────────────────────────────────────────────
  pin: {
    width: 18,
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinCore: { width: 7, height: 7, borderRadius: Radius.full },

  recoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
    ...Shadow.md,
  },
  recoBadgeText: {
    color: Colors.textInverse,
    fontSize: 11,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.2,
  },
  recoPointer: {
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: Colors.primary,
  },

  // ── Navigation ────────────────────────────────────────────────────────────
  navTopCard: {
    position: 'absolute',
    left: Spacing.base,
    right: Spacing.base,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    overflow: 'hidden',
  },
  navTopInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    gap: Spacing.md,
  },
  navIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  navTextCol: { flex: 1, gap: 3 },
  navInstruction: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    lineHeight: 22,
  },
  navStreet: { color: Colors.textMuted, fontSize: FontSize.sm },
  navDistBadge: {
    backgroundColor: 'rgba(0,122,255,0.15)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    flexShrink: 0,
  },
  navDistText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  navFooterWrap: {
    position: 'absolute',
    bottom: 0,
    left: Spacing.base,
    right: Spacing.base,
  },
  navFooterCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    overflow: 'hidden',
  },
  navFooterInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.base,
  },
  navEtaCol: { flex: 1 },
  navEtaTime: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  navEtaDist: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 2 },
  navEndBtn: {
    backgroundColor: 'rgba(255,59,48,0.12)',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.28)',
  },
  navEndBtnText: {
    color: '#FF3B30',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },

  // ── Start button ──────────────────────────────────────────────────────────
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md + 2,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    ...Shadow.green,
  },
  startBtnText: {
    color: Colors.textInverse,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.4,
  },
});
