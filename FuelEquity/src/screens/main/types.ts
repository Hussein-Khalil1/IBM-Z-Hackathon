export type MainTabParamList = {
  Home: undefined;
  Splits: undefined;
  AddExpense: undefined;
  GreenMiles: undefined;
  GasPrices: undefined;
  Maps: undefined;
};

export type HomeStackParamList = {
  HomeScreen: undefined;
  Profile: undefined;
  CreateTrip: undefined;
  TripLobby: { tripId: string };
  TripDetail: { tripId: string };
  JoinTrip: { code?: string };
  GasPrices: undefined;
  RoutePicker: { origin: { latitude: number; longitude: number }; destination: { latitude: number; longitude: number }; baseFuelEfficiency: number; gasPrice: number; onSelectRoute: (route: any) => void };
  FuelSimulator: undefined;
};

export type SplitsStackParamList = {
  SplitsScreen: undefined;
};

export type AddExpenseStackParamList = {
  AddExpenseScreen: undefined;
};

export type GreenMilesStackParamList = {
  GreenMilesScreen: undefined;
  GreenMilesRedeem: undefined;
};

export type MapsStackParamList = {
  MapsScreen: undefined;
};
