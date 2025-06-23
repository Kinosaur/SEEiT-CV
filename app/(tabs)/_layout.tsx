import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { IconSymbol } from '../../components/ui/IconSymbol';
import { Colors } from '../../constants/Colors';

export default function TabLayout() {
    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: Colors.light.tabIconSelected,
                tabBarLabelStyle: styles.tabLabel,
                tabBarIconStyle: styles.tabIcon,
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Home',
                    headerShown: false, // Hide header for this tab
                    tabBarIcon: ({ color, focused }) => (
                        <IconSymbol
                            name={focused ? 'house.fill' : 'house'}
                            size={30}
                            color={color}
                        />
                    ),
                }}
            />
            <Tabs.Screen
                name="rgbPlayer"
                options={{
                    title: 'Test',
                    headerShown: false, // Hide header for this tab
                    tabBarIcon: ({ color, focused }) => (
                        <IconSymbol
                            name={focused ? 'wand.and.rays.inverse' : 'wand.and.rays'}
                            size={30}
                            color={color}
                        />
                    ),
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Profile',
                    headerShown: false, // Hide header for this tab
                    tabBarIcon: ({ color, focused }) => (
                        <IconSymbol
                            name={focused ? 'person.crop.circle.fill' : 'person.crop.circle'}
                            size={30}
                            color={color}
                        />
                    ),
                }}
            />
        </Tabs>
    );
}

const styles = StyleSheet.create({
    tabLabel: {
        marginTop: 0,
        fontSize: 14,
        fontFamily: 'AtkinsonBold',
        textAlign: 'center',
        alignSelf: 'center',
    },
    tabIcon: {
        alignSelf: 'center',
        justifyContent: 'center',
    },
});