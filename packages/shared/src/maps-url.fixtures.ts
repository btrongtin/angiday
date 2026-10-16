import type { ParsedMapsPlace } from './maps-url';

export interface PlaceUrlFixture {
  label: string;
  url: string;
  expected: ParsedMapsPlace;
}

/** Resolved Google Maps place URLs and what the parser must read from them. */
export const placeUrlFixtures: PlaceUrlFixture[] = [
  {
    label: 'desktop place URL with viewport and pin (pin wins)',
    url: 'https://www.google.com/maps/place/Ph%E1%BB%9F+H%C3%B2a+Pasteur/@10.7895162,106.6880276,17z/data=!3m1!4b1!4m6!3m5!1s0x31752f2c8b0b8d0f:0x6f6b1f0b3a1c9e2d!8m2!3d10.7895109!4d106.6906025!16s%2Fg%2F1tgf4q1d?entry=ttu',
    expected: { name: 'Phở Hòa Pasteur', lat: 10.7895109, lng: 106.6906025 },
  },
  {
    label: 'mobile share URL without @viewport, pin only',
    url: 'https://www.google.com/maps/place/B%C3%BAn+b%C3%B2+Hu%E1%BA%BF+O+Ph%C6%B0%E1%BB%A3ng/data=!4m6!3m5!1s0x31752f3a1b2c3d4e:0x1a2b3c4d5e6f7a8b!8m2!3d10.776543!4d106.700123!16s%2Fg%2F11abc?utm_source=mstt_1&entry=gps',
    expected: { name: 'Bún bò Huế O Phượng', lat: 10.776543, lng: 106.700123 },
  },
  {
    label: 'viewport only',
    url: 'https://www.google.com/maps/place/C%C6%A1m+T%E1%BA%A5m+Ba+Ghi%E1%BB%81n/@10.79,106.68,17z',
    expected: { name: 'Cơm Tấm Ba Ghiền', lat: 10.79, lng: 106.68 },
  },
  {
    label: 'decomposed (NFD) accents are normalized to NFC',
    url: 'https://www.google.com/maps/place/Pho%CC%9B%CC%89+Ho%CC%80a/@10.79,106.69,17z',
    expected: { name: 'Phở Hòa', lat: 10.79, lng: 106.69 },
  },
  {
    label: 'a literal plus sign is encoded as %2B',
    url: 'https://www.google.com/maps/place/Coffee+%2B+Tea/@10.8,106.7,17z',
    expected: { name: 'Coffee + Tea', lat: 10.8, lng: 106.7 },
  },
  // Real links shared by the owner (Task 2 Step 1): resolved with `curl -s -o /dev/null -w '%{redirect_url}'`,
  // one hop each. Pin and viewport differ slightly in all three — proof the "prefer pin" rule matters.
  {
    label: 'owner: TÔ GHẸ - HỦ TIẾU GHẸ Tân Định',
    url: 'https://www.google.com/maps/place/T%C3%94+GH%E1%BA%B8+-+H%E1%BB%A6+TI%E1%BA%BEU+GH%E1%BA%B8+T%C3%A2n+%C4%90%E1%BB%8Bnh/@10.7917545,106.6926015,17z/data=!3m1!4b1!4m6!3m5!1s0x317529006656f9ef:0xe1f83b4b1284b797!8m2!3d10.7917492!4d106.6951764!16s%2Fg%2F11ntmp232g!18m1!1e1?entry=tts',
    expected: { name: 'TÔ GHẸ - HỦ TIẾU GHẸ Tân Định', lat: 10.7917492, lng: 106.6951764 },
  },
  {
    label: 'owner: Bún riêu Út Nhỏ - CN5',
    url: 'https://www.google.com/maps/place/B%C3%BAn+ri%C3%AAu+%C3%9At+Nh%E1%BB%8F+-+CN5/@10.7866645,106.7665907,17z/data=!3m1!4b1!4m6!3m5!1s0x317527003688e4af:0x8ad9b8dc409ab37e!8m2!3d10.7866592!4d106.7691656!16s%2Fg%2F11x673crm_!18m1!1e1?entry=tts',
    expected: { name: 'Bún riêu Út Nhỏ - CN5', lat: 10.7866592, lng: 106.7691656 },
  },
  {
    label: 'owner: Bún Bò Huế Thiện Tâm',
    url: 'https://www.google.com/maps/place/B%C3%BAn+B%C3%B2+Hu%E1%BA%BF+Thi%E1%BB%87n+T%C3%A2m/@10.7813854,106.7671822,16.25z/data=!4m6!3m5!1s0x317525aeb993110b:0x4b7f6044688f0e1e!8m2!3d10.7788544!4d106.7605133!16s%2Fg%2F11t6wrr7pk!18m1!1e1?entry=tts',
    expected: { name: 'Bún Bò Huế Thiện Tâm', lat: 10.7788544, lng: 106.7605133 },
  },
];

/** URLs that must NOT parse into a place. */
export const unparseableUrlFixtures: { label: string; url: string }[] = [
  { label: 'query URL without coordinates', url: 'https://www.google.com/maps?q=B%C3%A1nh+m%C3%AC+Hu%E1%BB%B3nh+Hoa&ftid=0x31752f:0x1234' },
  { label: 'search URL', url: 'https://www.google.com/maps/search/b%C3%BAn+b%C3%B2/@10.77,106.70,15z' },
  { label: 'non-Google host', url: 'https://evil.example.com/maps/place/X/@10.7,106.7,17z' },
  { label: 'latitude out of range', url: 'https://www.google.com/maps/place/X/@99.1,106.7,17z' },
  { label: 'not a URL', url: 'maps place X' },
  { label: 'broken percent-encoding in the name', url: 'https://www.google.com/maps/place/%E1%BB/@10.7,106.7,17z' },
];
