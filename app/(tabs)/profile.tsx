import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { StyleSheet } from 'react-native';

export default function Profile() {
    return (
        <ThemedView style={styles.container}>
            <ThemedText style={styles.text}>This is your <ThemedText style={styles.textHighlight}>Profile</ThemedText> page.</ThemedText>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    text: {
        fontSize: 24,
        fontFamily: 'AtkinsonBold',
    },
    textHighlight: {
        fontSize: 30,
        color: Colors.dark.secondaryAccent,
    },
});
