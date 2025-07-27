# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a web-based implementation of the Rota game - a two-player strategy game played on a board with 8 cells arranged in a circle plus a center cell (9 positions total). Players alternate placing 3 pieces each, then move pieces to form a line of 3.

## Project Structure

- **index.html** - Main game interface with SVG-based board visualization
- **script.js** - Core game logic in the `RotaGame` class
- **style.css** - Game styling and animations
- **README.md** - Game rules and description

## Game Architecture

The game is implemented as a single-page web application with vanilla JavaScript:

### Core Game Logic (`script.js`)
- `RotaGame` class manages all game state and logic
- Two-phase gameplay: placement phase (placing pieces) → movement phase (moving pieces)
- Board represented as array of 9 positions (0-7 outer circle, 8 center)
- Movement validation using predefined connection map
- Win detection checks 12 possible winning patterns (circumference and diameter lines)

### Board Representation
- Positions 0-7: Outer circle clockwise from top
- Position 8: Center
- Connections defined in `getConnections()` method
- Visual board uses SVG with precise coordinate positioning

### Game States
- `gamePhase`: 'placement' or 'movement'
- `currentPlayer`: 1 or 2
- `board`: Array tracking piece positions
- `selectedPosition`: For movement phase piece selection

## Development Commands

This is a static web application with no build process. To develop:

- Open `index.html` directly in a web browser
- Use a local web server for development: `python -m http.server 8000`
- No compilation, bundling, or dependency management required