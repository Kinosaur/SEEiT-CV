import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Image, StyleSheet, TouchableOpacity } from "react-native";

import Buttons from "@/components/Buttons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { saveToLibraryAsync } from "expo-media-library";

export default function MediaScreen() {
    const { media, type } = useLocalSearchParams();
    const router = useRouter();

    console.log(media, type);

    return (
        <ThemedView style={styles.container}>
            {
                type === "photo" ? (
                    <Image
                        source={{ uri: `file://${media}` }}
                        style={{ width: "100%", height: "80%", resizeMode: "contain" }}
                    />
                ) : null
                // <Video source={{ uri: media }} style={{ width: "100%", height: "100%" }} />
            }
            <Buttons
                title="Save to gallery"
                containerStyle={{ alignSelf: "center" }}
                onPress={async () => {
                    saveToLibraryAsync(media as string);
                    Alert.alert("Saved to gallery!");
                    router.back();
                }}
            />
            <TouchableOpacity
                onPress={() => router.push("/")}
                style={styles.link}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Delete and go back"
            >
                <ThemedText type="link">Delete and go back</ThemedText>
            </TouchableOpacity>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
    },
    link: {
        marginTop: 15,
        paddingVertical: 15,
        alignSelf: "center",
    },
});