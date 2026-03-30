import type { ConfigContext, ExpoConfig } from "expo/config";

const defaultApiBaseUrl = "http://10.0.2.2:3000/api";
const defaultEasProjectId = "3de16230-9d7d-45fc-bb39-3924ce25aec2";

export default ({ config }: ConfigContext): ExpoConfig => {
  const extra: NonNullable<ExpoConfig["extra"]> = {
    ...(config.extra ?? {}),
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? defaultApiBaseUrl,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? defaultEasProjectId,
    },
  };

  return {
    name: "Photo Book Maker",
    slug: "photo-book-maker-mobile",
    version: "1.0.0",
    scheme: "photobookmaker",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    runtimeVersion: {
      policy: "appVersion",
    },
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.vince.photobookmaker",
      buildNumber: "1",
    },
    android: {
      package: "com.vince.photobookmaker",
      versionCode: 1,
      blockedPermissions: [
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
      ],
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      [
        "expo-image-picker",
        {
          cameraPermission: false,
          microphonePermission: false,
          photosPermission:
            "Allow Photo Book Maker to import trip photos for book creation.",
        },
      ],
    ],
    extra,
  };
};
