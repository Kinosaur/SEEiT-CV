import { Colors } from "@/constants/Colors";
import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import {
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
}
export default function Buttons({
    onPress,
    iconName,
    title,
    containerStyle,
    iconSize,
}: ButtonProps) {
    // Determine accessibility label
    let accessibilityLabel = title
        ? title
        : iconName
            ? iconName.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
            : "Button";
    return (
        <TouchableOpacity
            onPress={onPress}
            style={[
                styles.container,
                {
                    backgroundColor: Colors.dark.background,
                    borderRadius: title ? 6 : 40,
                    alignSelf: "flex-start",
                },
                containerStyle,
            ]}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
        >
            {iconName && (
                <Ionicons name={iconName} size={iconSize ?? 28} color={"white"} />
            )}
            {title ? (
                <Text
                    style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: "white",
                    }}
                >
                    {title}
                </Text>
            ) : null}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 7,
        borderRadius: 40,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
    },
});