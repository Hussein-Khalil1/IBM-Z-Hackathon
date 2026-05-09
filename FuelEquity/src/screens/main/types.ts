export type MainTabParamList = {
  Home: undefined;
  Splits: undefined;
  AddExpense: undefined;
  GreenMiles: undefined;
  Maps: undefined;
};

export type HomeStackParamList = {
  HomeScreen: undefined;
  Profile: undefined;
  CreateTrip: undefined;
  TripLobby: { tripId: string };
  TripDetail: { tripId: string };
  JoinTrip: { code?: string };
};

export type SplitsStackParamList = {
  SplitsScreen: undefined;
};

export type AddExpenseStackParamList = {
  AddExpenseScreen: undefined;
};

export type GreenMilesStackParamList = {
  GreenMilesScreen: undefined;
};

export type MapsStackParamList = {
  MapsScreen: undefined;
};
