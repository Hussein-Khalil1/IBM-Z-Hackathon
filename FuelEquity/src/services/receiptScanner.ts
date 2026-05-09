import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import * as ImagePicker from 'expo-image-picker';

export type ScannedReceipt = {
  merchantName: string;
  amount: number;
  category: 'gas' | 'toll' | 'parking' | 'other';
};

export async function scanReceiptFromImage(
  source: 'camera' | 'library',
): Promise<ScannedReceipt | null> {
  let result: ImagePicker.ImagePickerResult;

  if (source === 'camera') {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) throw new Error('permission_denied');
    result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
  } else {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) throw new Error('permission_denied');
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
    });
  }

  if (result.canceled || !result.assets[0]?.base64) return null;

  const asset = result.assets[0];
  const fn = httpsCallable<{ imageBase64: string; mimeType: string }, ScannedReceipt>(
    getFunctions(getApp()),
    'scanReceipt',
  );

  const rawMime = asset.mimeType ?? 'image/jpeg';
  const mimeType =
    rawMime === 'image/heic' || rawMime === 'image/heif' ? 'image/jpeg' : rawMime;

  const response = await fn({
    imageBase64: asset.base64!,
    mimeType,
  });

  return response.data;
}
