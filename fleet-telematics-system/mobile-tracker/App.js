import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

const LOCATION_TASK_NAME = "vehicle-location-background-task";
const VEHICLE_ID = "car_01";
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const FAST_UPLOAD_INTERVAL_MS = 1000;

async function postLocationToSupabase(location) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing Expo Supabase environment variables.");
  }

  const { latitude, longitude, speed } = location.coords ?? {};

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/location_logs`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      vehicle_id: VEHICLE_ID,
      latitude,
      longitude,
      speed: Number.isFinite(speed) ? speed : null,
      timestamp: new Date(location.timestamp ?? Date.now()).toISOString(),
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase insert failed: ${response.status} ${message}`);
  }
}

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("Background location task error:", error.message);
    return;
  }

  const locations = data?.locations ?? [];

  try {
    await Promise.all(locations.map(postLocationToSupabase));
  } catch (insertError) {
    console.error("Could not upload location:", insertError.message);
  }
});

export default function App() {
  const foregroundSubscriptionRef = useRef(null);
  const fastUploadIntervalRef = useRef(null);
  const isUploadingRef = useRef(false);
  const [isTracking, setIsTracking] = useState(false);
  const [statusText, setStatusText] = useState("Idle");

  useEffect(() => {
    Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .then((started) => {
        setIsTracking(started);
        setStatusText(started ? "Tracking car_01" : "Idle");
      })
      .catch((error) => setStatusText(error.message));

    return () => {
      foregroundSubscriptionRef.current?.remove();
      stopFastUploadLoop();
    };
  }, []);

  async function ensureForegroundLocationPermissions() {
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      throw new Error("Location services are disabled on this device.");
    }

    const foreground = await Location.requestForegroundPermissionsAsync();
    if (!foreground.granted) {
      throw new Error("Foreground location permission was denied.");
    }
  }

  async function tryStartBackgroundTracking() {
    const backgroundAvailable =
      await Location.isBackgroundLocationAvailableAsync();
    if (!backgroundAvailable) {
      return false;
    }

    const background = await Location.requestBackgroundPermissionsAsync();
    if (!background.granted) {
      return false;
    }

    const alreadyStarted =
      await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);

    if (!alreadyStarted) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Highest,
        activityType: Location.ActivityType.AutomotiveNavigation,
        distanceInterval: 1,
        timeInterval: 1000,
        deferredUpdatesInterval: 1000,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "Vehicle tracker is running",
          notificationBody: "Uploading car_01 GPS points to Supabase.",
          notificationColor: "#2563eb",
        },
      });
    }

    return true;
  }

  async function startForegroundTracking() {
    foregroundSubscriptionRef.current?.remove();

    foregroundSubscriptionRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Highest,
        distanceInterval: 0,
        timeInterval: 500,
      },
      async (location) => {
        try {
          await postLocationToSupabase(location);
          setStatusText("Tracking car_01");
        } catch (error) {
          setStatusText(error.message);
        }
      }
    );
  }

  function stopFastUploadLoop() {
    if (fastUploadIntervalRef.current) {
      clearInterval(fastUploadIntervalRef.current);
      fastUploadIntervalRef.current = null;
    }
  }

  function startFastUploadLoop() {
    stopFastUploadLoop();

    fastUploadIntervalRef.current = setInterval(async () => {
      if (isUploadingRef.current) {
        return;
      }

      try {
        isUploadingRef.current = true;
        const currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });

        await postLocationToSupabase(currentLocation);
        setStatusText("Tracking car_01");
      } catch (error) {
        setStatusText(error.message);
      } finally {
        isUploadingRef.current = false;
      }
    }, FAST_UPLOAD_INTERVAL_MS);
  }

  async function startTracking() {
    try {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error(
          "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
        );
      }

      setStatusText("Requesting permissions...");
      await ensureForegroundLocationPermissions();

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      await postLocationToSupabase(currentLocation);

      await startForegroundTracking();
      startFastUploadLoop();

      let backgroundStarted = false;
      try {
        backgroundStarted = await tryStartBackgroundTracking();
      } catch (backgroundError) {
        console.warn("Background tracking unavailable:", backgroundError.message);
      }

      setIsTracking(true);
      setStatusText(
        backgroundStarted
          ? "Tracking car_01 in background"
          : "Tracking car_01 while app is open"
      );
    } catch (error) {
      setStatusText("Idle");
      Alert.alert("Tracking could not start", error.message);
    }
  }

  async function stopTracking() {
    try {
      const started =
        await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);

      if (started) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }

      foregroundSubscriptionRef.current?.remove();
      foregroundSubscriptionRef.current = null;
      stopFastUploadLoop();

      setIsTracking(false);
      setStatusText("Stopped");
    } catch (error) {
      Alert.alert("Tracking could not stop", error.message);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Vehicle Telematics</Text>
          <Text style={styles.title}>Mobile GPS Tracker</Text>
          <Text style={styles.subtitle}>Vehicle ID: {VEHICLE_ID}</Text>
        </View>

        <View style={styles.statusPanel}>
          <Text style={styles.statusLabel}>Status</Text>
          <Text style={[styles.statusValue, isTracking && styles.tracking]}>
            {statusText}
          </Text>
        </View>

        <View style={styles.buttonRow}>
          <Pressable
            disabled={isTracking}
            onPress={startTracking}
            style={({ pressed }) => [
              styles.button,
              styles.startButton,
              (pressed || isTracking) && styles.buttonMuted,
            ]}
          >
            <Text style={styles.buttonText}>Start Tracking</Text>
          </Pressable>

          <Pressable
            disabled={!isTracking}
            onPress={stopTracking}
            style={({ pressed }) => [
              styles.button,
              styles.stopButton,
              (pressed || !isTracking) && styles.buttonMuted,
            ]}
          >
            <Text style={styles.buttonText}>Stop Tracking</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f5f5f4",
  },
  screen: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 24,
  },
  header: {
    gap: 6,
  },
  kicker: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  title: {
    color: "#18181b",
    fontSize: 34,
    fontWeight: "800",
  },
  subtitle: {
    color: "#52525b",
    fontSize: 16,
  },
  statusPanel: {
    backgroundColor: "#ffffff",
    borderColor: "#e7e5e4",
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
    gap: 8,
  },
  statusLabel: {
    color: "#71717a",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  statusValue: {
    color: "#18181b",
    fontSize: 20,
    fontWeight: "700",
  },
  tracking: {
    color: "#15803d",
  },
  buttonRow: {
    gap: 12,
  },
  button: {
    alignItems: "center",
    borderRadius: 8,
    paddingVertical: 16,
  },
  startButton: {
    backgroundColor: "#2563eb",
  },
  stopButton: {
    backgroundColor: "#dc2626",
  },
  buttonMuted: {
    opacity: 0.45,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
});
