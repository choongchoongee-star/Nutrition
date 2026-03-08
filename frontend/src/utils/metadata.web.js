export const getImageMetadata = async (assetId) => {
  return null;
};

// EXIF DateTimeOriginal 형식: "YYYY:MM:DD HH:MM:SS"
export const parseDateFromExif = (exif) => {
  if (!exif) return null;
  const raw = exif.DateTimeOriginal || exif.DateTime;
  if (!raw) return null;
  const datePart = raw.split(' ')[0]; // "YYYY:MM:DD"
  const parts = datePart.split(':');
  if (parts.length !== 3) return null;
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
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
