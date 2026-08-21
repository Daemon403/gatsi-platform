import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigation } from './src/navigation/AppNavigation';
import { AppStoreProvider } from './src/store/AppStore';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppStoreProvider>
        <AppNavigation />
      </AppStoreProvider>
    </SafeAreaProvider>
  );
}
