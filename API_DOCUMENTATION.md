# Roto Leaderboard System API Documentation

## Overview

The Roto Leaderboard System provides a comprehensive backend solution for managing competitive gaming leaderboards, seasonal competitions, and player statistics. This RESTful API supports real-time ranking updates, multiple leaderboard categories, and detailed performance analytics.

## Base URL

```
http://localhost:3000/api
```

## Authentication

Most endpoints are publicly accessible. Internal endpoints (marked as "Internal") should be protected by authentication middleware in production.

## Rate Limiting

- Global: 1000 requests per 15 minutes per IP
- Leaderboards: 100 requests per minute
- Games: 50 processing requests per minute
- Admin operations: 10 requests per minute

## Response Format

All API responses follow this structure:

```json
{
  "success": boolean,
  "data": object | array,
  "message": string,
  "errors": array (validation errors only)
}
```

---

## Leaderboard Endpoints

### Get Leaderboard Categories

**GET** `/leaderboards`

Returns all available leaderboard categories.

**Response:**
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "id": 1,
        "name": "global_rating",
        "description": "Global rating leaderboard",
        "reset_frequency": "none",
        "is_active": true
      }
    ]
  }
}
```

### Get Leaderboard Data

**GET** `/leaderboards/{category}`

Returns paginated leaderboard data for a specific category.

**Parameters:**
- `category` (path): Leaderboard category name
- `page` (query): Page number (default: 1)
- `limit` (query): Items per page (default: 50, max: 100)
- `sortBy` (query): Sort field (rating, wins, win_percentage, total_games, current_rank)
- `sortOrder` (query): Sort order (ASC, DESC)
- `seasonId` (query): Filter by season ID

**Response:**
```json
{
  "success": true,
  "data": {
    "players": [
      {
        "current_rank": 1,
        "previous_rank": 2,
        "rank_change": 1,
        "rating": 1456,
        "wins": 45,
        "losses": 12,
        "draws": 3,
        "total_games": 60,
        "win_percentage": 75.00,
        "last_game_at": "2024-01-15T10:30:00Z",
        "player_id": 123,
        "username": "champion_alice",
        "display_name": "Alice Champion",
        "avatar_url": null
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 150,
      "totalPages": 3
    },
    "categoryName": "global_rating",
    "seasonId": null,
    "sortBy": "rating",
    "lastUpdated": "2024-01-15T11:00:00Z"
  }
}
```

### Get Player Rank

**GET** `/leaderboards/{category}/players/{playerId}/rank`

Returns a player's position and stats in a specific leaderboard.

**Parameters:**
- `category` (path): Leaderboard category name
- `playerId` (path): Player ID
- `seasonId` (query): Season ID filter

**Response:**
```json
{
  "success": true,
  "data": {
    "current_rank": 15,
    "previous_rank": 18,
    "rank_change": 3,
    "rating": 1245,
    "wins": 32,
    "losses": 8,
    "total_games": 40,
    "win_percentage": 80.00,
    "highest_rank": 12,
    "username": "bob_master",
    "display_name": "Bob Master"
  }
}
```

### Get Players Around Rank

**GET** `/leaderboards/{category}/players/{playerId}/surrounding`

Returns players ranked around a specific player.

**Parameters:**
- `category` (path): Leaderboard category name
- `playerId` (path): Player ID
- `seasonId` (query): Season ID filter
- `range` (query): Number of players above/below (default: 5, max: 20)

### Get Position History

**GET** `/leaderboards/players/{playerId}/position-history`

Returns position change history for a player.

**Parameters:**
- `playerId` (path): Player ID
- `categoryName` (query): Filter by category
- `seasonId` (query): Filter by season
- `limit` (query): Max records (default: 100, max: 500)
- `days` (query): Time period in days (default: 30, max: 365)

### Get Recent Position Changes

**GET** `/leaderboards/position-changes/recent`

Returns recent significant position changes across all players.

**Parameters:**
- `limit` (query): Max records (default: 50, max: 200)
- `categoryName` (query): Filter by category
- `seasonId` (query): Filter by season
- `minRankChange` (query): Minimum rank change (default: 5)
- `hours` (query): Time period in hours (default: 24, max: 168)

### Recalculate Rankings (Admin)

**POST** `/leaderboards/{category}/recalculate`

Triggers ranking recalculation for a category.

**Body:**
```json
{
  "seasonId": 1
}
```

---

## Season Endpoints

### Get All Seasons

**GET** `/seasons`

Returns paginated list of seasons.

**Parameters:**
- `page` (query): Page number (default: 1)
- `limit` (query): Items per page (default: 20, max: 100)
- `includeInactive` (query): Include inactive seasons (default: true)

### Get Current Season

**GET** `/seasons/current`

Returns the currently active season.

### Get Season by ID

**GET** `/seasons/{seasonId}`

Returns details of a specific season.

### Get Season Winners

**GET** `/seasons/{seasonId}/winners`

Returns top performers from a completed season.

**Parameters:**
- `categoryName` (query): Leaderboard category (default: seasonal_rating)
- `topCount` (query): Number of winners (default: 10, max: 100)

### Create Season (Admin)

**POST** `/seasons`

Creates a new season.

**Body:**
```json
{
  "name": "Season 2 - 2024",
  "startDate": "2024-04-01T00:00:00Z",
  "endDate": "2024-07-01T00:00:00Z"
}
```

### Start Season (Admin)

**POST** `/seasons/{seasonId}/start`

Activates a season.

### End Season (Admin)

**POST** `/seasons/{seasonId}/end`

Ends a season and processes final standings.

**Body:**
```json
{
  "createSnapshot": true,
  "resetWeeklyMonthly": true
}
```

---

## Game Endpoints

### Process Game Result

**POST** `/games/result`

Processes a single game result and updates leaderboards.

**Body:**
```json
{
  "gameId": "match_123456",
  "player1Id": 1,
  "player2Id": 2,
  "winnerId": 1,
  "gameType": "standard",
  "duration": 1800,
  "resultType": "win"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "gameId": "match_123456",
    "ratingChanges": {
      "1": {
        "oldRating": 1200,
        "newRating": 1215,
        "change": 15
      },
      "2": {
        "oldRating": 1180,
        "newRating": 1165,
        "change": -15
      }
    },
    "message": "Game result processed successfully"
  }
}
```

### Process Batch Game Results

**POST** `/games/batch-results`

Processes multiple game results in a single request.

**Body:**
```json
{
  "gameResults": [
    {
      "gameId": "match_123456",
      "player1Id": 1,
      "player2Id": 2,
      "winnerId": 1
    },
    {
      "gameId": "match_123457",
      "player1Id": 3,
      "player2Id": 4,
      "winnerId": null
    }
  ]
}
```

### Get Player Rating

**GET** `/games/players/{playerId}/rating`

Returns a player's current rating in a specific category.

**Parameters:**
- `category` (query): Leaderboard category (default: global_rating)

### Calculate Win Probability

**GET** `/games/win-probability`

Calculates win probability between two players based on their ratings.

**Parameters:**
- `player1Id` (query): First player ID
- `player2Id` (query): Second player ID
- `category` (query): Rating category (default: global_rating)

**Response:**
```json
{
  "success": true,
  "data": {
    "player1Id": 1,
    "player2Id": 2,
    "category": "global_rating",
    "player1Rating": 1450,
    "player2Rating": 1320,
    "winProbabilities": {
      "player1": 68.24,
      "player2": 31.76
    }
  }
}
```

### Simulate Rating Changes

**POST** `/games/simulate-rating-changes`

Simulates rating changes for a hypothetical match without processing it.

**Body:**
```json
{
  "player1Id": 1,
  "player2Id": 2,
  "winnerId": 1,
  "category": "global_rating"
}
```

### Get Head-to-Head Statistics

**GET** `/games/head-to-head`

Returns match history and statistics between two players.

**Parameters:**
- `player1Id` (query): First player ID
- `player2Id` (query): Second player ID
- `limit` (query): Max recent matches (default: 10, max: 50)

### Get Recent Games

**GET** `/games/recent`

Returns recent game results with optional filtering.

**Parameters:**
- `limit` (query): Max results (default: 50, max: 200)
- `playerId` (query): Filter by player
- `gameType` (query): Filter by game type
- `hours` (query): Time period in hours (default: 24, max: 168)

### Get Game Statistics

**GET** `/games/statistics`

Returns aggregated game statistics over time.

**Parameters:**
- `period` (query): Aggregation period (daily, weekly, monthly)
- `days` (query): Time period in days (default: 30, max: 365)

---

## Error Handling

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `404` - Not Found
- `409` - Conflict (duplicate game ID)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

### Error Response Format

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "player1Id",
      "message": "Player 1 ID must be a positive integer"
    }
  ]
}
```

---

## Webhooks & Real-time Updates

The system supports real-time leaderboard updates through:

1. **Cache Invalidation**: Automatic cache refresh when rankings change
2. **Position Change Tracking**: Notifications for significant rank movements
3. **Leaderboard Snapshots**: Historical data preservation for analysis

---

## Performance Considerations

1. **Caching**: Leaderboard data is cached for 5 minutes
2. **Pagination**: All list endpoints support pagination
3. **Indexing**: Database queries are optimized with appropriate indexes
4. **Rate Limiting**: Prevents abuse and ensures fair usage
5. **Bulk Operations**: Batch processing for multiple game results

---

## Security Features

1. **Input Validation**: All inputs are validated and sanitized
2. **Rate Limiting**: Multiple tiers of rate limiting
3. **CORS Protection**: Configurable origin restrictions
4. **Security Headers**: Helmet.js security middleware
5. **SQL Injection Prevention**: Parameterized queries only

---

## Monitoring & Logging

1. **Request Logging**: All API requests are logged
2. **Performance Metrics**: Query performance monitoring
3. **Error Tracking**: Comprehensive error logging
4. **Health Checks**: System health monitoring endpoint

---

For more information or support, please refer to the project documentation or contact the development team.