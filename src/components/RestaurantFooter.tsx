import {
    Facebook,
    Instagram,
    MapPin,
    Navigation,
    Phone,
    Share2,
    Twitter,
    Wifi,
  } from "lucide-react";
  import { RESTAURANT } from "@/lib/restaurant";
  
  async function shareRestaurant() {
    const url = window.location.origin;
    if (navigator.share) {
      try {
        await navigator.share({ title: RESTAURANT.name, url });
      } catch {
        // el usuario canceló
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        window.alert("Enlace copiado: " + url);
      } catch {
        window.alert("Copia este enlace: " + url);
      }
    }
  }
  
  export function RestaurantFooter() {
    return (
      <footer className="mt-12 border-t border-border px-6 pb-10 pt-8 text-center">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0" />
          <span>{RESTAURANT.address}</span>
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Wifi className="size-4 shrink-0" />
          <span>
            Wifi <b>{RESTAURANT.wifiName}</b> · contraseña: {RESTAURANT.wifiPassword}
          </span>
        </div>
  
        <div className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-3">
          <a
            href={`tel:${RESTAURANT.phone}`}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-3 text-sm font-semibold text-foreground active:scale-[0.98]"
          >
            <Phone className="size-4" /> Llamar
          </a>
          <a
            href={RESTAURANT.mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-3 text-sm font-semibold text-foreground active:scale-[0.98]"
          >
            <Navigation className="size-4" /> Cómo llegar
          </a>
          <button
            onClick={shareRestaurant}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-3 text-sm font-semibold text-foreground active:scale-[0.98]"
          >
            <Share2 className="size-4" /> Compartir
          </button>
        </div>
  
        <div className="mt-6 flex justify-center gap-5 text-muted-foreground">
          <a href={RESTAURANT.social.facebook} aria-label="Facebook" className="hover:text-foreground">
            <Facebook className="size-5" />
          </a>
          <a href={RESTAURANT.social.instagram} aria-label="Instagram" className="hover:text-foreground">
            <Instagram className="size-5" />
          </a>
          <a href={RESTAURANT.social.twitter} aria-label="Twitter" className="hover:text-foreground">
            <Twitter className="size-5" />
          </a>
        </div>
  
        <p className="mt-6 text-xs text-muted-foreground">
          Copyright {new Date().getFullYear()} © {RESTAURANT.name}
        </p>
  
      </footer>
    );
  }