const express = require('express');
const path = require('path');
require('dotenv').config();
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// Add this route to serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Update the generate-schedule endpoint to be simpler
app.post('/api/generate-schedule', async (req, res) => {
    const { preferences, fixedSchedule, academicTasks } = req.body;

    try {
        // Return a basic schedule based on fixed blocks
        const schedule = {
            blocks: [],
            notes: "Schedule generated without AI assistance"
        };

        res.json({
            schedule: schedule,
            warnings: [],
            notes: "Basic schedule created"
        });

    } catch (error) {
        console.error('Error in schedule generation:', error);
        res.status(500).json({ 
            error: 'Failed to generate schedule',
            details: error.message
        });
    }
});

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});