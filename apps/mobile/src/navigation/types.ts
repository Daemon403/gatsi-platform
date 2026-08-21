export type RootStackParamList = {
  Tabs: undefined;
  OrderDetail: { orderId: string };
  CreateOrder: undefined;
  PickupRequest: undefined;
  Receipt: { orderId: string };
};

export type TabParamList = {
  Home: undefined;
  Orders: undefined;
  Center: undefined;
  Stock: undefined;
  More: undefined;
};
