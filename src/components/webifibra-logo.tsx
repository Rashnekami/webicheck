import logoAsset from "@/assets/webifibra-logo.jpeg.asset.json";
import { cn } from "@/lib/utils";

interface WebifibraLogoProps {
  className?: string;
  size?: number;
  alt?: string;
}

export function WebifibraLogo({
  className,
  size = 56,
  alt = "Webifibra",
}: WebifibraLogoProps) {
  return (
    <img
      src={logoAsset.url}
      alt={alt}
      width={size}
      height={size}
      className={cn("rounded-2xl object-cover shadow-sm", className)}
    />
  );
}
