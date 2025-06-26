# Base Image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and the lockfile to leverage Docker layer caching
# A yarn.lock file is required for this step to succeed.
COPY package.json yarn.lock ./

# Install dependencies using the pre-installed yarn
# The --frozen-lockfile flag ensures that the exact versions from the lockfile are used
RUN yarn install --frozen-lockfile --production

# Copy the rest of the application code
COPY . .

# Create necessary directories for runtime
RUN mkdir -p logs uploads temp

# Switch to a non-root user for security
RUN chown -R node:node /app
USER node

# Expose the application port
EXPOSE 3000

# The command to start the application
CMD [ "yarn", "start" ]