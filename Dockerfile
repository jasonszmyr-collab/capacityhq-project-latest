# Use Node.js LTS version
FROM node:22-alpine AS base

# Match the tested npm version
RUN npm install --global npm@11.7.0 --ignore-scripts

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
FROM base AS dependencies
RUN npm ci --ignore-scripts

# Build stage
FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine AS production

# Copy built files to nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration if you have one (optional)
COPY nginx.spa.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
