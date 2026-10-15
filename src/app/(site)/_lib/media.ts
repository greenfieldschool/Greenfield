// School photos (Supabase public storage) shared by the public inner pages.
const media = "https://sxujllqkkrwkqslmbgpc.supabase.co/storage/v1/object/public/media";

export const schoolPhotos = {
  culture: { src: `${media}/20230524-FulaniCulture-2.jpg`, alt: "Students celebrating culture at Greenfield School" },
  entrance: {
    src: `${media}/Entrace%20International%20Anti-Corruption%20Day%202017-2.JPG`,
    alt: "School entrance during an event"
  },
  campus: { src: `${media}/IMG_20211127_114635_936-2.jpg`, alt: "Students and staff on campus" },
  art: { src: `${media}/Mr%20Teslim%20Explaining%20the%20wall%20Paintings1-2.JPG`, alt: "Teacher explaining student artwork" }
} as const;

export type SchoolPhoto = { src: string; alt: string };

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-02-05" -> { day: "05", month: "Feb", year: "2026", label: "5 Feb 2026" } without timezone shifts.
export function splitIsoDate(iso: string) {
  const [y, m, d] = iso.split("-");
  const month = months[Number(m) - 1] ?? m;
  return { day: d, month, year: y, label: `${Number(d)} ${month} ${y}` };
}
