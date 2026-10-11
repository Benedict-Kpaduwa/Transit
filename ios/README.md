# Calgary Transit — iOS

SwiftUI app (iOS 17+) using **Apple Maps (MapKit)** instead of Mapbox. It talks to the existing FastAPI backend in `../backend`.

## Setup
```sh
brew install xcodegen   # once
cd ios && xcodegen generate && open CalgaryTransit.xcodeproj
```
Set `API_BASE_URL` per configuration in `project.yml` (Debug: `http://localhost:8000`, works in the simulator; use your Mac's LAN IP on a device. Release: your deployed `https://<host>/api`). Re-run `xcodegen generate` after editing.

## Mapbox → Apple replacements
| Web (Mapbox) | iOS |
|---|---|
| Mapbox GL map, 3D buildings | SwiftUI `Map` with realistic elevation |
| Mapbox Search Box | `MKLocalSearchCompleter` / `MKLocalSearch` |
| `/directions/simple` (walk/drive) | `MKDirections` |

Transit data (stations, tracks, vehicles, arrivals, trip planning) still comes from the backend.
