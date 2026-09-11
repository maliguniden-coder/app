import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

type Native = {
  hasOverlayPermission: () => Promise<boolean>;
  requestOverlayPermission: () => Promise<boolean>;
  startCapture: (
    targetLang: string,
    targetLangName: string,
    backendUrl: string,
  ) => Promise<boolean>;
  stopCapture: () => Promise<boolean>;
};

const native = requireOptionalNativeModule<Native>("ScreenTranslator");

export const isScreenTranslatorAvailable = Platform.OS === "android" && !!native;

export async function hasOverlayPermission(): Promise<boolean> {
  if (!native) return false;
  return native.hasOverlayPermission();
}

export async function requestOverlayPermission(): Promise<boolean> {
  if (!native) return false;
  return native.requestOverlayPermission();
}

export async function startCapture(
  targetLang: string,
  targetLangName: string,
  backendUrl: string,
): Promise<boolean> {
  if (!native) return false;
  return native.startCapture(targetLang, targetLangName, backendUrl);
}

export async function stopCapture(): Promise<boolean> {
  if (!native) return false;
  return native.stopCapture();
}
