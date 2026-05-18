# FOODORO POS — Test Credentials

## ⚠️ NO DEMO ACCOUNT EXISTS
The previously seeded `admin@foodoro.local` demo account has been **PERMANENTLY DELETED**.
The database is empty by design — every user must create their own restaurant.

## How to Access the System

### Option 1: Sign Up (Email & Password)
1. Open: https://d40ff25a-6729-4cca-ab4c-05bad06cdee1.preview.emergentagent.com/sign-up
2. **Step 1**: Enter your restaurant name (e.g., "My Bistro")
3. **Step 2**: Enter your name, email, password (≥8 chars)
4. Click "Create Account" → you're logged in as the OWNER of your new restaurant

### Option 2: Sign in with Google
1. Open: https://d40ff25a-6729-4cca-ab4c-05bad06cdee1.preview.emergentagent.com/sign-in
2. Click "Sign in with Google"
3. You'll see "Redirecting to Google..." — wait briefly
4. On the next page, click "Continue with Google"
5. Choose your Google account
6. Authorize the app
7. You'll be returned to FOODORO logged in as OWNER of your auto-created restaurant

## What you get as OWNER:
- Brand new tenant (your own isolated data)
- 4 pre-seeded categories: Beverages, Main Dishes, Appetizers, Desserts
- Full access to: POS, Kitchen, Inventory, Reports, Customers, Suppliers, Coupons, Loyalty, Staff, Tables, QR Menu, Branches, Billing, Security
- SAR currency, 15% VAT, starter plan (free trial)
- Right to invite staff with limited roles

## API Direct Testing
After signup, you can grab a token:
```bash
TOKEN=$(curl -s -X POST http://localhost:8001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"YourPass123!","name":"Your Name","restaurantName":"Your Restaurant"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))")

curl -H "Authorization: Bearer $TOKEN" http://localhost:8001/api/categories
```

## Database
- **Host**: localhost:5432
- **Database**: foodoro_db
- **User**: foodoro
- **Password**: foodoro123

## Notes
- **Apple Sign-In**: Removed from UI. Requires Apple Developer Account ($99/year) to enable.
- **Stripe Billing**: Disabled. Set STRIPE_SECRET_KEY in backend .env to enable real payments.
- **Clerk**: Disabled. The system uses JWT auth via `/api/auth/login` and `/api/auth/signup`. Google login uses Emergent-managed OAuth.
