// Updated to import provider from the correct path (context/)
import { ColorBlindnessProvider } from '@/context/ColorBlindnessContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Ionicons } from '@expo/vector-icons';
import { DrawerContentComponentProps, DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Drawer } from 'expo-router/drawer';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { IconSymbol } from '../components/ui/IconSymbol';
import { Colors } from '../constants/Colors';

function CustomDrawerContent(props: DrawerContentComponentProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={{ flex: 1, paddingTop: 30, backgroundColor: themeColors.background }}
    >
      <View style={drawerStyles.closeButtonContainer}>
        <TouchableOpacity
          onPress={() => props.navigation.closeDrawer()}
          accessible
          accessibilityLabel="Close navigation drawer"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={32} color={themeColors.text} />
        </TouchableOpacity>
      </View>
      <DrawerItemList {...props} />
    </DrawerContentScrollView>
  );
}

const drawerStyles = StyleSheet.create({
  closeButtonContainer: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 10,
    paddingTop: 10,
    marginBottom: 10,
  },
});

export default function RootLayout() {
  const colorScheme = useColorScheme() ?? 'light';
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
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: themeColors.background }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: themeColors.background }}>
        <ColorBlindnessProvider>
          <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
            <Drawer
              screenOptions={{
                drawerPosition: 'right',
                drawerActiveTintColor: themeColors.secondaryAccent,
                drawerInactiveTintColor: themeColors.text,
                drawerStyle: {
                  backgroundColor: themeColors.background,
                  borderRightColor: themeColors.divider,
                  borderRightWidth: 1,
                },
                headerStyle: {
                  backgroundColor: themeColors.background,
                  borderBottomColor: themeColors.divider,
                  borderBottomWidth: 1
                },
                headerTintColor: themeColors.secondaryAccent,
                headerTitleStyle: {
                  fontFamily: 'AtkinsonBold',
                  fontSize: 24,
                  color: themeColors.text,
                },
                drawerHideStatusBarOnOpen: true,
                drawerLabelStyle: {
                  fontFamily: 'AtkinsonBold',
                  fontSize: 18,
                  color: themeColors.text,
                },
              }}
              drawerContent={props => <CustomDrawerContent {...props} />}
            >
              <Drawer.Screen
                name="index"
                options={{
                  title: 'SEEiT',
                  headerShown: false,
                  drawerIcon: ({ color, size, focused }) => (
                    <IconSymbol
                      name={focused ? 'house.fill' : 'house'}
                      color={color}
                      size={size}
                    />
                  ),
                }}
              />
              <Drawer.Screen
                name="colorBlindnessSelect"
                options={{
                  title: 'Select Color Type',
                  headerShown: false,
                  drawerIcon: ({ color, size, focused }) => (
                    <IconSymbol
                      name={focused ? 'checkmark.circle.fill' : 'checkmark.circle'}
                      color={color}
                      size={size}
                    />
                  ),
                }}
              />
              <Drawer.Screen
                name="colorBlindCameraScreen"
                options={{
                  title: 'Color Blindness',
                  headerShown: false,
                  drawerIcon: ({ color, size, focused }) => (
                    <IconSymbol
                      name={focused ? 'eye.fill' : 'eye'}
                      color={color}
                      size={size}
                    />
                  ),
                }}
              />
              <Drawer.Screen
                name="profile"
                options={{
                  title: 'Profile',
                  headerShown: false,
                  drawerIcon: ({ color, size, focused }) => (
                    <IconSymbol
                      name={focused ? 'person.crop.circle.fill' : 'person.crop.circle'}
                      color={color}
                      size={size}
                    />
                  ),
                }}
              />
            </Drawer>
            <StatusBar style="auto" />
          </ThemeProvider>
        </ColorBlindnessProvider>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}