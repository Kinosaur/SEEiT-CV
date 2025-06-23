import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { StyleSheet } from 'react-native';

export default function Index() {
    return (
        <ThemedView style={styles.container}>
            <ThemedText style={styles.text}>Welcome to <ThemedText style={styles.textHighlight}>SEEiT!</ThemedText></ThemedText>
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