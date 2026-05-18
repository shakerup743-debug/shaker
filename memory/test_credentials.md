# FOODORO POS — Test Credentials

## Demo Tenant
- **Tenant ID**: 1
- **Slug**: demo
- **Name**: Demo Restaurant
- **Currency**: SAR
- **VAT**: 15%
- **Country**: SA
- **Timezone**: Asia/Riyadh

## Admin User
- **Email**: admin@foodoro.local
- **Password**: admin123
- **Role**: owner
- **Tenant ID**: 1

## Database
- **Host**: localhost:5432
- **Database**: foodoro_db
- **User**: foodoro
- **Password**: foodoro123
- **Connection**: postgresql://foodoro:foodoro123@localhost:5432/foodoro_db

## JWT Secret (development)
- foodoro_jwt_secret_change_in_production_2026_at_least_32_chars

## Clerk
- DISABLED (no valid keys provided)
- The system uses JWT auth via /api/auth/login instead
- The Clerk shim (`src/lib/clerk-shim.ts`) adapts JWT auth to Clerk-like API for legacy components

## Test the API directly
```bash
# Get a JWT token
TOKEN=$(curl -s -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@foodoro.local","password":"admin123"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))")

# Use it
curl -H "Authorization: Bearer $TOKEN" http://localhost:8001/api/products
curl -H "Authorization: Bearer $TOKEN" http://localhost:8001/api/categories
```
