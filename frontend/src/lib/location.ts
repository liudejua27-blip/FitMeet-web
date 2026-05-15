import { reverseGeocode, type AmapPlace, type Coordinates } from './amap';

export function getBrowserLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('当前浏览器不支持定位'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => reject(new Error('定位失败，请检查浏览器权限')),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

export function coordinatesToPlace(location: Coordinates): AmapPlace {
  return {
    id: `current-${location.lng.toFixed(6)}-${location.lat.toFixed(6)}`,
    name: '我的当前位置',
    address: `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`,
    district: '当前位置',
    location,
  };
}

export async function resolveCurrentPlace(location: Coordinates): Promise<AmapPlace> {
  return (await reverseGeocode(location)) ?? coordinatesToPlace(location);
}
