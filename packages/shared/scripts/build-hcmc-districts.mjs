// One-off generator: geoBoundaries VNM ADM2 GeoJSON -> src/area/hcmc-legacy-districts.json
// Usage: node scripts/build-hcmc-districts.mjs <path-to-geoBoundaries-VNM-ADM2.geojson>
// Source and licence: see src/area/SOURCE.md (ADR-0018).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// key -> geoBoundaries shapeID (select by id, never by name: Binh Tan / Tan Phu exist in other provinces)
const SHAPE_IDS = {
  q1: '81297802B34545275526363',
  q2: '81297802B76466747653960',
  q3: '81297802B4427483692725',
  q4: '81297802B29563104023098',
  q5: '81297802B17569327634169',
  q6: '81297802B35379290873600',
  q7: '81297802B84259990428862',
  q8: '81297802B52284124086366',
  q9: '81297802B54605917200404',
  q10: '81297802B93335721036450',
  q11: '81297802B37641712637141',
  q12: '81297802B78652503258302',
  binh_chanh: '81297802B93683261125538',
  binh_tan: '81297802B42527210401893',
  binh_thanh: '81297802B74412015974526',
  can_gio: '81297802B7702852417854',
  cu_chi: '81297802B99873561685500',
  go_vap: '81297802B93588362587103',
  hoc_mon: '81297802B64363050509880',
  nha_be: '81297802B80984092880643',
  phu_nhuan: '81297802B72603937188235',
  tan_binh: '81297802B72151759297882',
  tan_phu: '81297802B97138813252769',
  thu_duc: '81297802B1678031067910',
};

const input = process.argv[2];
if (!input) {
  console.error('Usage: node build-hcmc-districts.mjs <geoBoundaries-VNM-ADM2.geojson>');
  process.exit(1);
}

const source = JSON.parse(readFileSync(input, 'utf8'));
const round = (n) => Math.round(n * 1e5) / 1e5;

const features = Object.entries(SHAPE_IDS).map(([key, shapeID]) => {
  const matches = source.features.filter((f) => f.properties?.shapeID === shapeID);
  if (matches.length !== 1) throw new Error(`${key}: expected exactly 1 feature with shapeID ${shapeID}, got ${matches.length}`);
  const { geometry } = matches[0];
  if (geometry?.type !== 'Polygon') throw new Error(`${key}: expected a Polygon, got ${geometry?.type}`);
  const rings = geometry.coordinates.map((ring) => ring.map(([lng, lat]) => [round(lng), round(lat)]));
  const outer = rings[0];
  const lngs = outer.map((p) => p[0]);
  const lats = outer.map((p) => p[1]);
  return {
    type: 'Feature',
    bbox: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
    properties: { key },
    geometry: { type: 'Polygon', coordinates: rings },
  };
});

const output = new URL('../src/area/hcmc-legacy-districts.json', import.meta.url);
writeFileSync(output, JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
console.log(`Wrote ${features.length} features to ${fileURLToPath(output)}`);
