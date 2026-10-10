import {
  BriefcaseBusiness,
  Car,
  Droplets,
  GraduationCap,
  Hammer,
  HardHat,
  House,
  PaintRoller,
  PartyPopper,
  Scissors,
  Smartphone,
  Snowflake,
  Sparkles,
  Truck,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

// Category.icon holds a Lucide icon name (set by the catalogue seed / admin).
const ICONS: Record<string, LucideIcon> = {
  wrench: Wrench,
  droplets: Droplets,
  zap: Zap,
  snowflake: Snowflake,
  hammer: Hammer,
  "paint-roller": PaintRoller,
  "hard-hat": HardHat,
  sparkles: Sparkles,
  scissors: Scissors,
  car: Car,
  smartphone: Smartphone,
  truck: Truck,
  "party-popper": PartyPopper,
  "graduation-cap": GraduationCap,
  house: House,
  briefcase: BriefcaseBusiness,
};

/** Icon names an admin can choose for a category (Phase 12). */
export const CATEGORY_ICON_NAMES = Object.keys(ICONS);

export function CategoryIcon({ name, className, style }: { name: string | null; className?: string; style?: React.CSSProperties }) {
  const Icon = (name && ICONS[name]) || Wrench;
  return <Icon aria-hidden className={className} style={style} />;
}
