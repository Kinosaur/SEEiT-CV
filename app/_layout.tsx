import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Drawer } from 'expo-router/drawer';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '../components/ui/IconSymbol';
import { Colors } from '../constants/Colors';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    Atkinson: require('../assets/fonts/AtkinsonHyperlegible-Regular.ttf'),
    AtkinsonItalic: require('../assets/fonts/AtkinsonHyperlegible-Italic.ttf'),
    AtkinsonBold: require('../assets/fonts/AtkinsonHyperlegible-Bold.ttf'),
    AtkinsonBoldItalic: require('../assets/fonts/AtkinsonHyperlegible-BoldItalic.ttf'),
  });

  if (!loaded) return null;

  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? Colors.dark : Colors.light;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
          <Drawer
            screenOptions={{
              drawerPosition: 'right',
              drawerActiveTintColor: themeColors.secondaryAccent,
              drawerInactiveTintColor: themeColors.text,
              drawerStyle: {
                backgroundColor: themeColors.background,
                width: 250, // reduced width
              },
              headerStyle: { backgroundColor: themeColors.background },
              headerTintColor: themeColors.secondaryAccent,
              headerTitleStyle: {
                fontFamily: 'AtkinsonBold',
                fontSize: 24,
              },
              drawerLabelStyle: {
                fontFamily: 'AtkinsonBold',
                fontSize: 18,
              },
            }}
          >
            <Drawer.Screen
              name="index"
              options={{
                title: 'SEEiT',
                headerShown: true,
                drawerIcon: ({ color, size, focused }) => (
                  <IconSymbol name={focused ? 'house.fill' : 'house'} color={color} size={size} />
                ),
              }}
            />
            <Drawer.Screen
              name="profile"
              options={{
                title: 'Profile',
                headerShown: true,
                drawerIcon: ({ color, size, focused }) => (
                  <IconSymbol name={focused ? 'person.crop.circle.fill' : 'person.crop.circle'} color={color} size={size} />
                ),
              }}
            />
          </Drawer>
          <StatusBar style="auto" />
        </ThemeProvider>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}
