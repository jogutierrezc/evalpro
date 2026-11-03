# ---- Build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Variables VITE_* se incrustan en el JavaScript al compilar: deben definirse como
# "Build Variable" en Coolify.
ARG VITE_BASE_PATH=/evalpro/
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_GOOGLE_AI_KEY
ARG VITE_OPENROUTER_API_KEY
ARG VITE_OPENROUTER_MODEL
ARG VITE_SITE_NAME
ARG VITE_SITE_URL
ENV VITE_BASE_PATH=$VITE_BASE_PATH \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_GOOGLE_AI_KEY=$VITE_GOOGLE_AI_KEY \
    VITE_OPENROUTER_API_KEY=$VITE_OPENROUTER_API_KEY \
    VITE_OPENROUTER_MODEL=$VITE_OPENROUTER_MODEL \
    VITE_SITE_NAME=$VITE_SITE_NAME \
    VITE_SITE_URL=$VITE_SITE_URL
RUN npm run build

# ---- Runtime ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
