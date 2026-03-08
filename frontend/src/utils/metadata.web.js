import exifr from 'exifr';

export const getImageMetadata = async () => null;

// JPEG, HEIC 모두 지원 - 이미지 blob에서 직접 EXIF 날짜 추출
export const extractDateFromUri = async (uri) => {
  try {
    const res = await fetch(uri);
    const blob = await res.blob();
    const data = await exifr.parse(blob, { pick: ['DateTimeOriginal', 'DateTime'] });
    const dateValue = data?.DateTimeOriginal || data?.DateTime;
    if (!dateValue) return null;
    return formatDate(new Date(dateValue));
  } catch (e) {
    console.error('EXIF extraction failed:', e);
    return null;
  }
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
  const year = d.getFullYear();
  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;
  return [year, month, day].join('-');
};
