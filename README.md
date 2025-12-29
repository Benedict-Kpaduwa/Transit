# 🚇 Calgary Transit Real-Time Tracker

A modern, interactive web application for tracking Calgary Transit's system in real-time. Built with React.js, FastAPI, and Mapbox GL, featuring 3D visualization, live transit positions, and comprehensive station information.

![Calgary C-Train Map](https://img.shields.io/badge/Status-Active-success)
![License](https://img.shields.io/badge/License-MIT-blue)
![Calgary Transit](https://img.shields.io/badge/Calgary-Transit-red)

---

## Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Running the Application](#-running-the-application)
- [API Documentation](#-api-documentation)
- [Frontend Components](#-frontend-components)
- [Backend Architecture](#-backend-architecture)
- [Data Sources](#-data-sources)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

### **Interactive 3D Map**
- Mapbox GL-powered 3D visualization
- Smooth camera movements and animations
- 3D building extrusions at higher zoom levels
- Real-time transit position markers
- Click-to-zoom station interactions

### **Real-Time Transit Data**
- Live C-Train positions (Red Line & Blue Line)
- Station availability status
- Route visualization with color-coded lines
- Train direction indicators
- Next station predictions

### **Modern UI/UX**
- Collapsible sidebar with station lists
- Accordion-grouped lines (shadcn/ui)
- Responsive design for desktop and mobile
- Smooth transitions and animations

### **Station Information**
- 42+ C-Train stations
- Red Line (201): 27 stations
- Blue Line (202): 15 stations
- Shared downtown Transit Mall (Free Fare Zone)
- Station coordinates and metadata

---

## Tech Stack

### **Frontend**
- **Framework**: React.js
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Map**: Mapbox GL JS
- **UI Components**: shadcn/ui
- **Icons**: Lucide React

### **Backend**
- **Framework**: FastAPI
- **Language**: Python 3.10+
- **HTTP Client**: httpx
- **Validation**: Pydantic v2
- **CORS**: FastAPI CORS Middleware

### **Data Sources**
- **Calgary Open Data Portal**: Real-time transit feeds
- **GTFS Data**: Static station locations
- **Mapbox**: Base maps and geocoding

---

## Project Structure

```
transit/
├── frontend/                    # React.js Frontend
│   ├── public/ 
│   │   └── train.glb         
│   ├── src/
│   │   ├── assets/           
│   │   ├── components/        
│   │   │   ├── ui/ 
│   │   │   ├── Map.tsx 
│   │   │   ├── LoadingSpinner.tsx 
│   │   │   ├── Sidebar.tsx        
│   │   │   ├── Station.tsx 
│   │   │   ├── Train3D.tsx
│   │   │   ├── TrainControls.tsx  
│   │   │   └── TrainModel.tsx 
│   │   ├── data/ 
│   │   │   └── StationObject.tsx 
│   │   ├── hooks/  
│   │   │   └── useTrainSimulation.ts 
│   │   ├── lib/
│   │   │   └── utils.ts 
│   │   ├── services/   
│   │   │   └── api.ts 
│   │   ├── CalgaryMap.tsx
│   │   ├── index.css  
│   │   └── main.tsx
│   ├── .env.local
│   ├── index.html
│   ├── .gitignore
│   ├── components.json
│   ├── eslint.config.js
│   ├── package.json
│   ├── tsconfig.node.json
│   ├── tsconfig.app.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── backend/                     # FastAPI Backend
│   ├── main.py               
│   ├── config.py             
│   ├── models/  
│   │   └── geo.py             
│   ├── services/
│   │   ├── __init__.py
│   │   └── calgary_transit.py 
│   ├── .env                   
│   ├── requirements.txt
│   ├── .gitignore
│   └── README.md
│
├── docs/                        # Documentation
│   ├── API.md
│   ├── SETUP.md              
│   └── CONTRIBUTING.md         
│
└── README.md                
```

---

## Prerequisites

### **System Requirements**
- **Node.js**: v18.0.0 or higher
- **Python**: 3.10 or higher
- **npm** or **yarn** or **pnpm**: Latest version
- **pip**: Latest version

### **Required Accounts**
1. **Mapbox Account** (Free Tier)
   - Sign up at [mapbox.com](https://www.mapbox.com/)
   - Create an access token
   - Free tier: 50,000 map loads/month

2. **Calgary Open Data** (Optional but Recommended)
   - Sign up at [data.calgary.ca](https://data.calgary.ca/)
   - Generate an app token
   - Required for higher API rate limits

---

## Installation

### **1. Clone the Repository**

```bash
git clone https://github.com/Benedict-Kpaduwa/transit.git
cd transit
```

### **2. Frontend Setup**

```bash
cd frontend

# Install dependencies
npm install
# or
yarn install
# or
pnpm install

# Create environment file
cp .env.example .env.local
```

**Edit `.env.local`:**
```env
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
VITE_BASE_API_URL=http://localhost:8000
```

### **3. Backend Setup**

```bash
cd ../backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create environment file
cp .env.example .env
```

**Edit `.env`:**
```env
CALGARY_APP_TOKEN=your_calgary_open_data_token_here
```

---

## Configuration

### **Backend Configuration**

**`config.py`:**
```python
import os
from dotenv import load_dotenv

load_dotenv()

CALGARY_APP_TOKEN = os.getenv("CALGARY_APP_TOKEN")
API_TIMEOUT = 30.0
DEFAULT_PAGE_SIZE = 100
MAX_PAGE_SIZE = 1000
```

---

## Running the Application

### **Development Mode**

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate  # or venv\Scripts\activate on Windows
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend will be available at: **http://localhost:8000**

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
# or
yarn dev
# or
pnpm dev
```

Frontend will be available at: **http://localhost:5173**

### **Production Mode**

**Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

**Frontend:**
```bash
cd frontend
npm run build
npm start
```

---

## 📡 API Documentation

### **Base URL**
```
http://localhost:8000
```

### **Endpoints**

#### **Health Check**
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "calgary-transit-api"
}
```

---

#### **Get All Stations**
```http
GET /api/stations
```

**Query Parameters:**
- `line` (optional): `"Red"` or `"Blue"`
- `unique` (optional): `true` (default) to remove duplicates

**Response:**
```json
{
  "total": 42,
  "stations": [
    {
      "id": "201-tuscany",
      "name": "Tuscany Station",
      "code": "1234",
      "coordinates": {
        "latitude": 51.1241,
        "longitude": -114.2289
      },
      "line": "Red",
      "route": "201",
      "shared": false,
      "zone": "1"
    }
  ]
}
```

---

#### **Get Sorted Stations**
```http
GET /api/stations/sorted?line=Red
```

Returns stations in geographical order along the line.

---

#### **Get Real-Time Vehicles**
```http
GET /api/vehicles
```

**Query Parameters:**
- `line` (optional): `"Red"` or `"Blue"`

**Response:**
```json
{
  "total": 8,
  "vehicles": [
    {
      "id": "3001",
      "label": "Train 3001",
      "route": "201",
      "line": "Red",
      "coordinates": {
        "latitude": 51.0447,
        "longitude": -114.0708
      },
      "direction": "Northbound",
      "speed": 45.5,
      "heading": 180.0,
      "next_stop": "City Hall",
      "last_updated": "2024-12-22T15:30:00Z"
    }
  ],
  "last_updated": "2024-12-22T15:30:00Z"
}
```

---

#### **Get All Routes**
```http
GET /api/routes
```

**Response:**
```json
{
  "total_routes": 2,
  "routes": [
    {
      "route_id": "201",
      "route_name": "Red Line",
      "line_color": "#DC143C",
      "stations": [...],
      "total_stations": 27
    },
    {
      "route_id": "202",
      "route_name": "Blue Line",
      "line_color": "#0088FF",
      "stations": [...],
      "total_stations": 15
    }
  ]
}
```

---

#### **Get Specific Route**
```http
GET /api/routes/201
```

Returns detailed information for Red Line (201) or Blue Line (202).

---

### **API Documentation UI**

Visit these URLs when the backend is running:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

---

## 🎨 Frontend Components

### **Map Component** (`components/Map.tsx`)

Main Mapbox GL component with:
- 3D terrain and buildings
- Station markers
- Train position markers
- Route lines
- Interactive popups

**Props:**
```typescript
interface MapComponentProps {
  stations: Station[];
  selectedStation: Station | null;
  onStationSelect: (station: Station) => void;
  onCloseStationInfo: () => void;
}
```

---

### **Sidebar Component** (`components/Sidebar.tsx`)

Collapsible sidebar with:
- Line accordions (Red/Blue)
- Station cards
- Search functionality
- Filter options

**Props:**
```typescript
interface SidebarProps {
  redLineStations: Station[];
  blueLineStations: Station[];
  selectedStation: Station | null;
  onStationClick: (station: Station) => void;
}
```

---

### **StationCard Component** (`components/StationCard.tsx`)

Individual station display:
- Station name
- Line indicator
- Status (available/unavailable)
- Click handler

---

## 🔧 Backend Architecture

### **Service Layer**

#### **calgary_api.py**
- HTTP client for Calgary Open Data
- Request/response handling
- Error management
- Rate limiting

```python
class CalgaryTransitAPI:
    async def fetch_stops(...)
    async def fetch_vehicles(...)
    async def fetch_routes(...)
```

#### **data_processor.py**
- Data transformation
- Station deduplication
- Geographic sorting
- Route generation

```python
def process_station_data(...)
def process_vehicle_data(...)
def deduplicate_stations(...)
def sort_stations_geographically(...)
```

---

### **Router Layer**

- **stations.py**: Station CRUD operations
- **vehicles.py**: Real-time vehicle tracking
- **routes.py**: Route information and generation

---

### **Models** (`models.py`)

Pydantic v2 models for type safety:

```python
class Coordinates(BaseModel):
    latitude: float
    longitude: float

class Station(BaseModel):
    id: str
    name: str
    coordinates: Coordinates
    line: str
    route: str
    shared: bool = False

class Vehicle(BaseModel):
    id: str
    route: str
    coordinates: Coordinates
    direction: str
    last_updated: datetime
```

---

## 📊 Data Sources

### **Calgary Open Data Portal**

**Datasets Used:**
1. **LRT Stations** (`2axz-xm4q`)
   - Station locations
   - Route assignments
   - Platform information

2. **LRT Routes** (`2wti-eh59`)
   - Track geometries
   - Line information
   - Direction data

3. **Real-Time Vehicle Positions** (`g27r-i3j7`)
   - Live train locations
   - Vehicle IDs
   - Speed and heading

### **API Endpoints:**
```
https://data.calgary.ca/resource/2axz-xm4q.json  # Stations
https://data.calgary.ca/resource/2wti-eh59.json  # Routes
https://data.calgary.ca/resource/g27r-i3j7.json  # Vehicles
```

### **Rate Limits:**
- **Without token**: 1,000 requests/day
- **With app token**: 10,000 requests/day

---

## 🐛 Troubleshooting

### **Common Issues**

#### **1. Map Not Loading**

**Symptom:** Blank map or "Error loading map"

**Solutions:**
```bash
# Check Mapbox token
echo $NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

# Verify token at mapbox.com
# Ensure token has correct scopes

# Clear Next.js cache
rm -rf .next
npm run dev
```

---

#### **2. API Connection Failed**

**Symptom:** "Failed to fetch" or CORS errors

**Solutions:**
```bash
# Check backend is running
curl http://localhost:8000/health

# Verify CORS settings in main.py
# Check API_URL in .env.local

# Test API directly
curl http://localhost:8000/api/stations
```

---

#### **3. No Train Positions**

**Symptom:** Stations show but no trains

**Solutions:**
```bash
# Check Calgary Transit API
curl "https://data.calgary.ca/resource/g27r-i3j7.json?$limit=1"

# Verify app token
echo $CALGARY_APP_TOKEN

# Check backend logs for API errors
```

---

#### **4. Duplicate Stations**

**Symptom:** Same station appears multiple times

**Solution:** The deduplication logic should handle this. If still seeing duplicates:

```python
# In data_processor.py, verify:
def deduplicate_stations(stations):
    # Ensure this function is called BEFORE sorting
    # Check normalized_name logic
```

---

#### **5. Incorrect Station Order**

**Symptom:** Lines appear zigzagged or have straight segments

**Solution:** Update the known station order lists:

```python
# In data_processor.py
RED_LINE_ORDER = [
    "Tuscany",
    "Crowfoot",
    # ... ensure ALL stations are listed in correct order
    "Victoria Park/Stampede",  # Don't forget this one!
    "Erlton/Stampede",
    # ...
]
```

---

## Testing

### **Backend Tests**

```bash
cd backend
pytest tests/ -v

# Test specific endpoint
pytest tests/test_stations.py -v

# With coverage
pytest --cov=. tests/
```

### **Frontend Tests**

```bash
cd frontend
npm test

# E2E tests with Playwright
npm run test:e2e
```

---

## Performance Optimization

### **Frontend**
- Enable Next.js image optimization
- Implement route-based code splitting
- Use React.memo for expensive components
- Lazy load map when visible

### **Backend**
- Implement Redis caching for API responses
- Use connection pooling for httpx
- Add request rate limiting
- Enable compression middleware

---

## Security Considerations

1. **API Keys**: Never commit `.env` files
2. **CORS**: Restrict origins in production
3. **Rate Limiting**: Implement per-IP limits
4. **Input Validation**: Use Pydantic models
5. **HTTPS**: Always use HTTPS in production

---

## Deployment

### **Frontend (Vercel)**

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd frontend
vercel

# Set environment variables in Vercel dashboard
```

### **Backend (Railway/Render/Fly.io)**

**Example `Dockerfile`:**
```dockerfile
FROM python:3.10-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

### **Development Workflow**

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### **Code Style**

**Frontend:**
- ESLint + Prettier
- TypeScript strict mode
- Tailwind CSS conventions

**Backend:**
- Black formatter
- isort for imports
- Type hints required
- Pydantic models for validation

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👥 Authors

- **Benedict Kpaduwa** - *Initial work* - [MyGitHub](https://github.com/Benedict-Kpaduwa)
- **Kamsi Okonji** - *Initial work* - [MyGitHub](https://github.com/kamsiokonji)

---

## Acknowledgments

- [Calgary Transit](https://www.calgarytransit.com/) for open data
- [Spots Project](https://spots.aksharbarot.com) for UI inspiration
- [Mapbox](https://www.mapbox.com/) for mapping platform
- [shadcn/ui](https://ui.shadcn.com/) for UI components
- [FastAPI](https://fastapi.tiangolo.com/) for backend framework

---

## Support

- **Issues**: [GitHub Issues](https://github.com/Benedict-Kpaduwa/Transit/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Benedict-Kpaduwa/Transit/discussions)
- **Email**: benedictkpaduwa@gmail.com

---

## Roadmap

### **Phase 1 - MVP**
- [x] Basic map visualization
- [x] Station markers
- [x] Line routes
- [x] Real-time train positions

### **Phase 2 - Enhanced Features**
- [ ] Schedule information
- [ ] Route planning
- [ ] Arrival predictions
- [ ] Service alerts

### **Phase 3 - Advanced Features**
- [ ] User accounts
- [ ] Favorite stations
- [ ] Push notifications
- [ ] Historical data analytics
- [ ] Mobile app (React Native)

---

## Additional Resources

- [Calgary Transit Website](https://www.calgarytransit.com/)
- [Calgary Open Data Portal](https://data.calgary.ca/)
- [Mapbox GL JS Documentation](https://docs.mapbox.com/mapbox-gl-js/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Next.js Documentation](https://nextjs.org/docs)

---

**Made with ❤️ in Calgary, Alberta, Canada 🇨🇦** 