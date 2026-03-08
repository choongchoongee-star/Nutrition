import * as MediaLibrary from 'expo-media-library';

export const getImageMetadata = async (assetId) => {
  if (!assetId) return null;
  
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') return null;

    const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
    return assetInfo;
  } catch (error) {
    console.error("Failed to get image metadata:", error);
    return null;
  }
};

export const parseDateFromExif = (exif) => {
  if (!exif) return null;
  const raw = exif.DateTimeOriginal || exif.DateTime;
  if (!raw) return null;
  const datePart = raw.split(' ')[0];
  const parts = datePart.split(':');
  if (parts.length !== 3) return null;
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
};

// 네이티브에서는 expo-image-picker가 exif를 직접 제공
export const extractDateFromUri = async (_uri, exif = null) => {
  return parseDateFromExif(exif);
};

export const suggestMealType = (hour) => {
  if (hour >= 5 && hour < 11) return "Breakfast";
  if (hour >= 11 && hour < 15) return "Lunch";
  if (hour >= 17 && hour < 21) return "Dinner";
  return "Snack";
};

export const formatDate = (date) => {
  const d = new Date(date);
  let month = '' + (d.getMonth() + 1);
  let day = '' + d.getDate();
  let year = d.getFullYear();

  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;

  return [year, month, day].join('-');
};
