// Fallback for using Ionicons on Android and web.

import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

// Map SF Symbols to Ionicons icon names
// See Ionicons directory: https://icons.expo.fyi/Ionicons
const MAPPING = {
  'person.crop.circle.fill': 'person-circle',
  'person.crop.circle': 'person-circle-outline',
  'house': 'home-outline',
  'house.fill': 'home',
  'wand.and.rays': 'color-filter-outline',
  'wand.and.rays.inverse': 'color-filter',
} as Record<SymbolViewProps['name'], ComponentProps<typeof Ionicons>['name']>;

type IconSymbolName = keyof typeof MAPPING;

/**
 * An icon component that uses native SF Symbols on iOS, and Ionicons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Ionicons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <Ionicons color={color} size={size} name={MAPPING[name]} style={style} />;
}
