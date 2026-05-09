# FuelEquity — Firestore Schema

## Collections

### `/users/{userId}`

Stores one document per authenticated user. The document ID matches `firebase.auth().currentUser.uid`.

| Field | Type | Description |
|---|---|---|
| `uid` | `string` | Same as document ID |
| `email` | `string` | Auth email |
| `displayName` | `string` | Display name |
| `photoURL` | `string?` | Profile photo URL |
| `createdAt` | `Timestamp` | Account creation time |
| `greenMilesTotal` | `number` | Denormalized total green miles earned |
| `vehicle.make` | `string?` | Vehicle make |
| `vehicle.model` | `string?` | Vehicle model |
| `vehicle.year` | `number?` | Vehicle year |
| `vehicle.fuelType` | `'gas' \| 'electric' \| 'hybrid'?` | Fuel type |
| `vehicle.mpg` | `number?` | Miles per gallon |

---

### `/trips/{tripId}`

One document per carpool trip. `riderIds` is kept in sync so membership checks can be done in security rules without a subcollection lookup.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Same as document ID |
| `ownerId` | `string` | userId of the trip creator / driver |
| `name` | `string` | Trip label (e.g. "Morning commute") |
| `description` | `string?` | Optional notes |
| `status` | `'active' \| 'completed' \| 'archived'` | Lifecycle state |
| `riderIds` | `string[]` | All member userIds (including owner) |
| `totalCost` | `number` | Denormalized sum of all expenses |
| `totalMiles` | `number` | Total miles driven |
| `co2SavedKg` | `number` | Estimated CO₂ saved vs. solo driving |
| `createdAt` | `Timestamp` | |
| `updatedAt` | `Timestamp` | |
| `completedAt` | `Timestamp?` | Set when status → completed |

---

### `/trips/{tripId}/expenses/{expenseId}`

Subcollection — one document per shared cost item on a trip.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Same as document ID |
| `tripId` | `string` | Parent trip ID (denormalized for collection-group queries) |
| `addedByUserId` | `string` | Who logged the expense |
| `category` | `'gas' \| 'toll' \| 'parking' \| 'other'` | |
| `amount` | `number` | Total cost in USD |
| `description` | `string?` | Optional note |
| `splitType` | `'equal' \| 'custom'` | How cost is divided |
| `splits` | `Record<userId, number>` | Each rider's share in USD |
| `receiptUrl` | `string?` | Cloud Storage download URL |
| `createdAt` | `Timestamp` | |

---

### `/trips/{tripId}/riders/{userId}`

Subcollection — one document per trip member. Document ID is the member's `userId`.

| Field | Type | Description |
|---|---|---|
| `userId` | `string` | Same as document ID |
| `role` | `'driver' \| 'passenger'` | |
| `status` | `'invited' \| 'active' \| 'left'` | Invite lifecycle |
| `joinedAt` | `Timestamp` | When invite was accepted |
| `amountOwed` | `number` | Denormalized total owed across expenses |
| `amountPaid` | `number` | Denormalized total settled |

---

### `/greenMiles/{recordId}`

One document per trip completion event for a user. Accumulates into `users.greenMilesTotal`.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Same as document ID |
| `userId` | `string` | Owner of the record |
| `tripId` | `string` | Source trip |
| `milesShared` | `number` | Miles carpooled |
| `co2SavedKg` | `number` | CO₂ offset (vs. solo drive at 25 mpg avg) |
| `pointsEarned` | `number` | Gamification points awarded |
| `createdAt` | `Timestamp` | |

---

### `/gasReports/{reportId}`

Community-submitted gas price reports.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Same as document ID |
| `reportedByUserId` | `string` | Submitter's userId |
| `stationName` | `string` | Station name |
| `address` | `string` | Street address |
| `location` | `GeoPoint` | Coordinates for map display |
| `pricePerGallon` | `number` | Price in USD |
| `fuelType` | `'regular' \| 'midgrade' \| 'premium' \| 'diesel'` | |
| `upvotes` | `number` | Community accuracy votes |
| `downvotes` | `number` | Community accuracy votes |
| `createdAt` | `Timestamp` | |

---

## Security Rules Summary

| Collection | Read | Write |
|---|---|---|
| `users/{uid}` | Owner only | Owner only |
| `trips/{tripId}` | Owner or any rider | Owner only (create: self as owner) |
| `trips/.../expenses` | Any trip member | Any trip member |
| `trips/.../riders` | Any trip member | Owner (invite), owner or self (update) |
| `greenMiles` | Record owner only | Record owner only |
| `gasReports` | Any authenticated user | Creator may edit/delete their own |

---

## Composite Indexes

| Collection | Fields | Purpose |
|---|---|---|
| `trips` | `ownerId ASC`, `createdAt DESC` | List trips I created |
| `trips` | `riderIds ARRAY_CONTAINS`, `createdAt DESC` | List trips I'm a member of |
| `trips` | `status ASC`, `createdAt DESC` | Filter trips by status |
| `expenses` (group) | `tripId ASC`, `createdAt DESC` | Fetch all expenses for a trip |
| `expenses` (group) | `addedByUserId ASC`, `createdAt DESC` | Expenses I've logged |
| `greenMiles` | `userId ASC`, `createdAt DESC` | Green miles history for a user |
| `gasReports` | `pricePerGallon ASC`, `createdAt DESC` | Sort gas reports by price |

---

## TypeScript Types

All types are exported from `src/types/firestore.ts` and re-exported via `src/types/index.ts`.

```ts
import { UserDoc, TripDoc, ExpenseDoc, RiderDoc, GreenMilesDoc, GasReportDoc } from '../types';
```
