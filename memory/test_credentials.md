# FOODPRO POS — Test Credentials

## Demo Account (للمقابلة المستثمر)
- **Email**: `demo@foodpro.com`
- **Password**: `Demo2026!`
- **Restaurant**: FoodPro Demo
- **Plan**: Enterprise (كل الميزات مفعلة)
- **URL**: https://d40ff25a-6729-4cca-ab4c-05bad06cdee1.preview.emergentagent.com

## كيف تنشئ حساباً جديداً:
1. افتح `/sign-up`
2. عبئ اسم المطعم + بياناتك
3. تصبح Owner بصلاحيات كاملة

## Database
- postgresql://foodoro:foodoro123@localhost:5432/foodoro_db

## Services
- **Backend** (Express 5): port 8001
- **Frontend** (Vite production build): port 3000
- **AI Sidecar** (Python FastAPI + emergentintegrations): port 9000 (internal only)
- **PostgreSQL**: port 5432
- **MongoDB**: port 27017

## AI Configuration
- Powered by Claude Haiku 4.5 via Emergent Universal LLM Key
- Key stored in supervisor env + .env files
- Sidecar at `/app/ai-sidecar/app.py`
