import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import { ComponentProps, ReactNode } from "react";
import {
    AccessibilityState,
    StyleProp,
    StyleSheet,
    Text,
    TouchableOpacity,
    ViewStyle,
} from "react-native";

interface ButtonProps {
    onPress: () => void;
    title?: string;
    iconName?: ComponentProps<typeof Ionicons>["name"];
    containerStyle?: StyleProp<ViewStyle>;
    iconSize?: number;
    accessibilityLabel?: string;
    accessibilityState?: AccessibilityState;
    accessibilityHint?: string;
    disabled?: boolean;
    children?: ReactNode;
}

export default function Buttons({
    onPress,
    iconName,
    title,
    containerStyle,
    iconSize,
    accessibilityLabel,
    accessibilityState,
    accessibilityHint,
    disabled,
    children,
}: ButtonProps) {
    const colorScheme = useColorScheme() ?? "light";
    const theme = Colors[colorScheme];
    const buttonBackground = theme.surface;
    const iconAndTextColor = theme.accent;

    const derivedLabel =
        accessibilityLabel ||
        title ||
        (iconName
            ? iconName.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
            : "Button");

    return (
        <TouchableOpacity
            onPress={disabled ? undefined : onPress}
            disabled={disabled}
            style={[
                styles.container,
                {
                    backgroundColor: buttonBackground,
                    borderRadius: 20,
                    alignSelf: "flex-start",
                    opacity: disabled ? 0.4 : 1,
                },
                containerStyle,
            ]}
            accessible
            accessibilityRole="button"
            accessibilityLabel={derivedLabel}
            accessibilityState={{ ...(accessibilityState || {}), disabled }}
            accessibilityHint={accessibilityHint}
        >
            {iconName && (
                <Ionicons
                    name={iconName}
                    size={iconSize ?? 28}
                    color={iconAndTextColor}
                />
            )}
            {title ? (
                <Text
                    style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: iconAndTextColor,
                    }}
                >
                    {title}
                </Text>
            ) : null}
            {children}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 7,
        borderRadius: 20,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        overflow: "hidden",
    },
});