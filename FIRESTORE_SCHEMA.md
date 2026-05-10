# Firestore Schema Documentation

## 👤 users
```javascript
{
  name: string,
  email: string,
  createdAt: timestamp,
  location: GeoPoint
}
```

## 🚗 vehicles
```javascript
{
  userId: string,
  fuelConsumptionPer100km: number,
  fuelTankCapacityLiters: number,
  fuelType: string,  // "petrol", "diesel", "electric", etc.
  currentFuelLevel: number,
  createdAt: timestamp
}
```

## ⛽ gasStations
```javascript
{
  name: string,
  location: GeoPoint,
  pricePerLiter: number,
  updatedAt: timestamp,
  // Optional fields for future expansion:
  // rating: number,
  // queueTime: number,
  // fuelTypes: ["premium", "regular", "diesel"]
}
```

## 🧭 routes
```javascript
{
  userId: string,
  origin: string,
  destination: string,
  
  fastestRoute: {
    distance: number,
    time: number,
    polyline: string
  },
  
  cheapestRoute: {
    distance: number,
    fuelCost: number,
    stops: [
      {
        stationId: string,
        name: string,
        location: GeoPoint,
        fuelToAdd: number,
        estimatedPrice: number
      }
    ]
  },
  
  createdAt: timestamp
}
```

## 💸 fuelReports (crowdsourced, like GasBuddy)
```javascript
{
  stationId: string,
  pricePerLiter: number,
  userId: string,
  createdAt: timestamp
}
```

## Query Indexes (in firestore.indexes.json)
- `vehicles` by `userId`
- `routes` by `userId` + `createdAt` (DESC)
- `fuelReports` by `stationId` + `createdAt` (DESC)
- `fuelReports` by `stationId` + `pricePerLiter` (ASC)
- `gasStations` by `pricePerLiter` (ASC)
