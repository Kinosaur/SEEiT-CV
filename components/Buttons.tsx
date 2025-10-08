import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import React, { ComponentProps, ReactNode } from "react";
import {
    AccessibilityState,
    ActivityIndicator,
    StyleProp,
    StyleSheet,
    Text,
    TouchableOpacity,
    ViewStyle,
} from "react-native";

type Variant = "surface" | "primary" | "outline" | "plain" | "danger";
type Size = "sm" | "md" | "lg" | "xl" | number; // number = custom diameter (if circular) or padding base

export interface ButtonProps {
    onPress: () => void;
    title?: string;
    iconName?: ComponentProps<typeof Ionicons>["name"];
    variant?: Variant;
    size?: Size; // semantic size or numeric
    circular?: boolean; // if true, creates a circle (width==height)
    iconSize?: number;
    iconPosition?: "left" | "right" | "only";
    loading?: boolean;
    containerStyle?: StyleProp<ViewStyle>;
    accessibilityLabel?: string;
    accessibilityState?: AccessibilityState;
    accessibilityHint?: string;
    disabled?: boolean;
    children?: ReactNode;
}

// Backward compatibility defaults mimic previous styling
export default function Buttons({
    onPress,
    iconName,
    title,
    variant = "surface",
    size = "md",
    circular = false,
    iconSize,
    iconPosition = "left",
    loading = false,
    containerStyle,
    accessibilityLabel,
    accessibilityState,
    accessibilityHint,
    disabled,
    children,
}: ButtonProps) {
    const colorScheme = useColorScheme() ?? "light";
    const theme = Colors[colorScheme];

    const derivedLabel =
        accessibilityLabel ||
        title ||
        (iconName
            ? iconName.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
            : "Button");

    // Size metrics
    const sizeMap: Record<Exclude<Size, number>, { pad: number; font: number; icon: number; diameter?: number }> = {
        sm: { pad: 6, font: 14, icon: 18 },
        md: { pad: 10, font: 16, icon: 24 },
        lg: { pad: 14, font: 18, icon: 28, diameter: 60 },
        xl: { pad: 20, font: 20, icon: 32, diameter: 110 }, // special large action
    } as const;

    const isNumeric = typeof size === "number";
    const sizeDef = isNumeric
        ? {
              // Keep padding reasonable for rectangular buttons; circular ignores it
              pad: Math.min(14, (size as number) * 0.3),
              font: Math.max(12, (size as number) * 0.18),
              // Make icons proportionally larger for circular numeric buttons for clarity
              icon: Math.max(18, circular ? (size as number) * 0.42 : (size as number) * 0.3),
              diameter: circular ? (size as number) : undefined,
          }
        : sizeMap[size];

    // Variant styling
    let backgroundColor: string | "transparent" = theme.surface;
    let borderColor: string | undefined;
    let textColor = theme.text;
    let borderWidth = 0;

    switch (variant) {
        case "primary":
            backgroundColor = theme.accent;
            textColor = theme.text;
            break;
        case "outline":
            backgroundColor = "transparent";
            borderColor = theme.accent;
            borderWidth = 2;
            textColor = theme.accent;
            break;
        case "plain":
            backgroundColor = "transparent";
            textColor = theme.accent;
            break;
        case "danger":
            backgroundColor = theme.error;
            textColor = theme.background;
            break;
        case "surface":
        default:
            backgroundColor = theme.surface;
            textColor = theme.accent;
            break;
    }

    if (disabled) {
        if (variant === "primary" || variant === "danger") {
            backgroundColor = theme.disabled;
            textColor = theme.placeholder;
        } else if (variant === "outline") {
            borderColor = theme.divider;
            textColor = theme.placeholder;
        } else if (variant === "plain") {
            textColor = theme.placeholder;
        } else {
            backgroundColor = theme.disabled;
            textColor = theme.placeholder;
        }
    }

    const baseStyle: ViewStyle = {
        backgroundColor,
        paddingHorizontal: circular ? 0 : sizeDef.pad * 1.6,
        paddingVertical: circular ? 0 : sizeDef.pad,
        borderRadius: circular ? (sizeDef.diameter ? sizeDef.diameter / 2 : 999) : 20,
        flexDirection: iconPosition === "right" ? "row-reverse" : "row",
        alignItems: "center",
        justifyContent: "center",
        gap: title && iconName ? 6 : 0, // slightly tighter icon-title gap
        alignSelf: "flex-start",
        borderWidth,
        borderColor,
        opacity: disabled ? 0.55 : 1,
        ...(circular && sizeDef.diameter
            ? { width: sizeDef.diameter, height: sizeDef.diameter }
            : {}),
        // Provide min tap target if not circular
        minHeight: circular ? undefined : 44,
    };

    const effectiveIconSize = iconSize ?? sizeDef.icon;

    // Small default hitSlop to make small circular buttons easier to tap
    const defaultHitSlop =
        circular && sizeDef.diameter && sizeDef.diameter < 56
            ? { top: 6, bottom: 6, left: 6, right: 6 }
            : undefined;

    return (
        <TouchableOpacity
            onPress={disabled || loading ? undefined : onPress}
            disabled={disabled || loading}
            style={[styles.container, baseStyle, containerStyle]}
            accessible
            accessibilityRole="button"
            accessibilityLabel={derivedLabel}
            accessibilityState={{ ...(accessibilityState || {}), disabled: disabled || loading, busy: loading || undefined }}
            accessibilityHint={accessibilityHint}
            hitSlop={defaultHitSlop}
        >
            {loading && (
                <ActivityIndicator size="small" color={textColor} style={{ marginRight: title ? 6 : 0 }} />
            )}
            {iconName && iconPosition !== "right" && iconPosition !== "only" && (
                <Ionicons name={iconName} size={effectiveIconSize} color={textColor} />
            )}
            {iconName && iconPosition === "only" && !title && (
                <Ionicons name={iconName} size={effectiveIconSize} color={textColor} />
            )}
            {title ? (
                <Text
                    style={{
                        fontSize: sizeDef.font,
                        fontWeight: "600",
                        color: textColor,
                    }}
                    numberOfLines={1}
                    accessibilityElementsHidden={true}
                    importantForAccessibility="no"
                >
                    {title}
                </Text>
            ) : null}
            {iconName && iconPosition === "right" && title && (
                <Ionicons name={iconName} size={effectiveIconSize} color={textColor} />
            )}
            {children}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        overflow: "hidden",
    },
});