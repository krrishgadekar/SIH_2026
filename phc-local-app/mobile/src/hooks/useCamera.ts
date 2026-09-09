import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'expo-camera';
import { Alert, Platform } from 'react-native';

export interface CapturedImage {
  uri: string;
  mimeType: string;
  filename: string;
  width: number;
  height: number;
}

export function useCamera() {
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);

  const requestCameraPermission = useCallback(async (): Promise<boolean> => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    const granted = status === 'granted';
    setCameraPermission(granted);
    return granted;
  }, []);

  const openCamera = useCallback(async (): Promise<CapturedImage | null> => {
    const granted = cameraPermission ?? (await requestCameraPermission());

    if (!granted) {
      Alert.alert(
        'Camera Permission Required',
        'RetinaSaarthi needs camera access to capture retinal images. ' +
          'Please grant permission in your device settings, or use "Upload Image" instead.',
        [{ text: 'OK' }],
      );
      return null;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: false,
        exif: false,
      });

      if (result.canceled || !result.assets?.[0]) return null;

      const asset = result.assets[0];
      return {
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
        filename: `retina_${Date.now()}.jpg`,
        width: asset.width,
        height: asset.height,
      };
    } catch {
      return null;
    }
  }, [cameraPermission, requestCameraPermission]);

  const openImagePicker = useCallback(async (): Promise<CapturedImage | null> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Library Permission Required',
        'RetinaSaarthi needs access to your photo library to upload retinal images.',
        [{ text: 'OK' }],
      );
      return null;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: false,
        exif: false,
      });

      if (result.canceled || !result.assets?.[0]) return null;

      const asset = result.assets[0];
      const uri = asset.uri;
      const parts = uri.split('/');
      const filename = parts[parts.length - 1] ?? `retina_upload_${Date.now()}.jpg`;

      return {
        uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
        filename,
        width: asset.width,
        height: asset.height,
      };
    } catch {
      return null;
    }
  }, []);

  return {
    cameraPermission,
    requestCameraPermission,
    openCamera,
    openImagePicker,
  };
}
