const express = require('express');
const OpenAI = require('openai');
const path = require('path');
require('dotenv').config();
const app = express();

// Initialize OpenAI with the new format
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.json());

// Add these lines before your routes
app.use(express.static(path.join(__dirname, '.')));

// Add this route to serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// First, define the actual schema definition
const scheduleSchemaDefinition = {
    type: "object",
    properties: {
        blocks: {
            type: "array",
            description: "Array of schedule blocks",
            items: {
                type: "object",
                properties: {
                    name: { 
                        type: "string",
                        description: "Name of the block (e.g., 'Laplace Study Session', 'Assignment Work')"
                    },
                    date: { 
                        type: "string",
                        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                        description: "Date in YYYY-MM-DD format"
                    },
                    startTime: { 
                        type: "string",
                        pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                        description: "Start time in 24-hour format (HH:MM)"
                    },
                    endTime: { 
                        type: "string",
                        pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                        description: "End time in 24-hour format (HH:MM)"
                    },
                    type: { 
                        type: "string",
                        enum: ["study", "free"],
                        description: "Type of block (study or free time)"
                    },
                    scheduledTasks: {
                        type: "array",
                        description: "Tasks scheduled during this block",
                        items: {
                            type: "object",
                            properties: {
                                type: {
                                    type: "string",
                                    enum: ["assignment", "exam"],
                                    description: "Type of academic task"
                                },
                                name: { 
                                    type: "string",
                                    description: "Name of the task"
                                },
                                duration: {
                                    type: "integer",
                                    minimum: 30,
                                    maximum: 90,
                                    description: "Duration in minutes (30-90)"
                                },
                                comment: {
                                    type: "string",
                                    description: "Additional notes or comments about the task"
                                }
                            },
                            required: ["type", "name", "duration"]
                        }
                    }
                },
                required: ["name", "date", "startTime", "endTime", "type", "scheduledTasks"]
            }
        },
        notes: {
            type: "string",
            description: "AI's explanation if free time is sacrificed or any other comment for the user"
        }
    },
    required: ["blocks"]
};

// Create the properly nested JSON schema object
const SCHEDULE_SCHEMA = {
    name: "ScheduleSchema",
    description: "A non-overlapping weekly schedule with study blocks and free time",
    schema: scheduleSchemaDefinition
};

// Update the system message to emphasize free time handling
const systemMessage = `You are an academic planning expert that creates non-overlapping study schedules. Follow these rules strictly:

1. NEVER create blocks that overlap with fixed schedule items
2. Prioritize scheduling within user's preferred work hours
3. If tasks fit within preferred hours, keep other times as free time
4. If tasks exceed preferred hours:
   - Use additional time in non-preferred hours
   - Add a "notes" field explaining which free time was reduced and why
5. If tasks still cannot fit, note that the schedule is not feasible
6. Each study block should be 45-90 minutes with breaks
7. Respect routines and fixed blocks
8. For difficult topics:
   - Schedule shorter, more frequent sessions
   - Include review sessions
   - Place harder topics during peak focus hours`;

// Function to calculate available time windows with date ranges
function calculateAvailableWindows(preferences, fixedSchedule, startDate, academicTasks) {
    // Ensure all required time preferences exist with defaults
    preferences = {
        wakeTime: preferences.wakeTime || '07:00',
        sleepTime: preferences.sleepTime || fixedSchedule.routines?.sleepTime || '23:00',
        preferredWorkHours: preferences.preferredWorkHours || [],
        minFreeTime: preferences.minFreeTime || 2,
        breakFrequency: preferences.breakFrequency || 60,
        breakDuration: preferences.breakDuration || 10
    };

    // Ensure routines structure exists with proper format
    fixedSchedule.routines = {
        morning: {
            end: fixedSchedule.routines?.morningRoutineEnd || preferences.wakeTime,
            activities: fixedSchedule.routines?.morningRoutine || []
        },
        evening: {
            start: fixedSchedule.routines?.eveningRoutineStart || preferences.sleepTime,
            activities: fixedSchedule.routines?.eveningRoutine || []
        }
    };

    // Ensure meals structure exists with defaults
    fixedSchedule.meals = {
        breakfast: fixedSchedule.meals?.breakfast || '08:00',
        lunch: fixedSchedule.meals?.lunch || '12:00',
        dinner: fixedSchedule.meals?.dinner || '18:00',
        durations: {
            breakfast: fixedSchedule.meals?.durations?.breakfast || 30,
            lunch: fixedSchedule.meals?.durations?.lunch || 30,
            dinner: fixedSchedule.meals?.durations?.dinner || 30
        }
    };

    const windows = {};
    const workDays = preferences.includeWeekends ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
    
    // Calculate end date based on latest due date/exam date
    const latestDate = getLatestTaskDate(academicTasks);
    const endDate = new Date(latestDate);
    
    // Iterate through dates until the end date
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay();
        
        // Skip if it's a weekend and weekends aren't included
        if (!preferences.includeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
            currentDate.setDate(currentDate.getDate() + 1);
            continue;
        }

        // Get all fixed blocks for this day
        const dayBlocks = [];

        // Add morning routine activities if they exist
        if (fixedSchedule.routines.morning.activities.length > 0) {
            let currentMorningTime = preferences.wakeTime;
            fixedSchedule.routines.morning.activities.forEach(activity => {
                if (activity && activity.duration) {
                    dayBlocks.push({
                        name: `Morning - ${activity.name}`,
                        startTime: currentMorningTime,
                        endTime: addMinutesToTime(currentMorningTime, activity.duration)
                    });
                    currentMorningTime = addMinutesToTime(currentMorningTime, activity.duration);
                }
            });
        }

        // Add evening routine activities if they exist
        if (fixedSchedule.routines.evening.activities.length > 0) {
            let currentEveningTime = fixedSchedule.routines.evening.start;
            fixedSchedule.routines.evening.activities.forEach(activity => {
                if (activity && activity.duration) {
                    dayBlocks.push({
                        name: `Evening - ${activity.name}`,
                        startTime: currentEveningTime,
                        endTime: addMinutesToTime(currentEveningTime, activity.duration)
                    });
                    currentEveningTime = addMinutesToTime(currentEveningTime, activity.duration);
                }
            });
        }

        // Add meals with their durations (if they exist)
        if (fixedSchedule.meals) {
            if (fixedSchedule.meals.breakfast) {
                dayBlocks.push({
                    name: "Breakfast",
                    startTime: fixedSchedule.meals.breakfast,
                    endTime: addMinutesToTime(
                        fixedSchedule.meals.breakfast, 
                        fixedSchedule.meals.durations?.breakfast || 30
                    )
                });
            }

            if (fixedSchedule.meals.lunch) {
                dayBlocks.push({
                    name: "Lunch",
                    startTime: fixedSchedule.meals.lunch,
                    endTime: addMinutesToTime(
                        fixedSchedule.meals.lunch, 
                        fixedSchedule.meals.durations?.lunch || 30
                    )
                });
            }

            if (fixedSchedule.meals.dinner) {
                dayBlocks.push({
                    name: "Dinner",
                    startTime: fixedSchedule.meals.dinner,
                    endTime: addMinutesToTime(
                        fixedSchedule.meals.dinner, 
                        fixedSchedule.meals.durations?.dinner || 30
                    )
                });
            }
        }

        // Add classes for this day
        if (fixedSchedule.classes) {
            const dayClasses = fixedSchedule.classes.filter(c => c.day === dayOfWeek);
            dayBlocks.push(...dayClasses);
        }

        // Add regular blocks for this day
        if (fixedSchedule.regularBlocks) {
            const dayRegularBlocks = fixedSchedule.regularBlocks.filter(b => b.day === dayOfWeek);
            dayBlocks.push(...dayRegularBlocks);
        }

        // Sort all blocks by start time
        dayBlocks.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

        // Find gaps between blocks (available windows)
        const availableWindows = [];
        let currentTime = preferences.wakeTime;

        dayBlocks.forEach(block => {
            if (timeToMinutes(currentTime) < timeToMinutes(block.startTime)) {
                // Only add window if it's at least 15 minutes long
                const duration = timeToMinutes(block.startTime) - timeToMinutes(currentTime);
                if (duration >= 15) {
                    availableWindows.push({
                        start: currentTime,
                        end: block.startTime
                    });
                }
            }
            currentTime = block.endTime;
        });

        // Add final window if there's time before sleep (at least 15 minutes)
        if (timeToMinutes(currentTime) < timeToMinutes(preferences.sleepTime)) {
            const duration = timeToMinutes(preferences.sleepTime) - timeToMinutes(currentTime);
            if (duration >= 15) {
                availableWindows.push({
                    start: currentTime,
                    end: preferences.sleepTime
                });
            }
        }

        // Store windows with the date if there are any available windows
        if (availableWindows.length > 0) {
            const dateStr = currentDate.toISOString().split('T')[0];
            windows[dateStr] = availableWindows;
        }
        
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return windows;
}

// Update getLatestTaskDate to use academicTasks parameter
function getLatestTaskDate(academicTasks) {
    const dates = [];
    
    // Safely handle assignments
    if (academicTasks?.assignments?.length > 0) {
        academicTasks.assignments.forEach(assignment => {
            dates.push(new Date(assignment.dueDate));
        });
    }
    
    // Safely handle exams
    if (academicTasks?.exams?.length > 0) {
        academicTasks.exams.forEach(exam => {
            dates.push(new Date(exam.date));
        });
    }
    
    // Return the latest date or default to 7 days from now if no tasks
    return dates.length > 0 
        ? new Date(Math.max(...dates))
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

// Helper function to format available windows for the prompt
function formatAvailableWindows(windows) {
    return Object.entries(windows)
        .map(([date, slots]) => {
            const dayDate = new Date(date);
            const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'long' });
            return `${dayName} (${date}):
${slots.map(slot => {
    const duration = (timeToMinutes(slot.end) - timeToMinutes(slot.start)) / 60;
    return `  • ${slot.start}–${slot.end} (${duration.toFixed(1)} hours)`;
}).join('\n')}`;
        })
        .join('\n\n');
}

// Update the checkScheduleOverlaps function to work with dates
function checkScheduleOverlaps(newBlocks, fixedSchedule) {
    const overlaps = [];
    
    // Convert fixed schedule blocks to date-based format
    const fixedBlocks = fixedSchedule.regularBlocks.map(block => {
        const blockDate = new Date();
        blockDate.setDate(blockDate.getDate() + ((7 + block.day - blockDate.getDay()) % 7));
        return {
            ...block,
            date: blockDate.toISOString().split('T')[0]
        };
    });

    const allBlocks = [...newBlocks, ...fixedBlocks];

    allBlocks.forEach((block1, index) => {
        allBlocks.forEach((block2, index2) => {
            if (index !== index2 && block1.date === block2.date) {
                if (checkTimeOverlap(block1.startTime, block1.endTime, block2.startTime, block2.endTime)) {
                    overlaps.push(`${block1.name} overlaps with ${block2.name} on ${block1.date}`);
                }
            }
        });
    });

    if (overlaps.length > 0) {
        console.log('Detected overlaps:', overlaps);
    }

    return overlaps;
}

// Add a helper function to validate the generated schedule
function validateSchedule(schedule, academicTasks) {
    const errors = [];
    const warnings = [];

    // Check if all assignments have at least one study block
    academicTasks.assignments.forEach(assignment => {
        const hasStudyBlock = schedule.blocks.some(block => 
            block.type === 'study' && 
            block.scheduledTasks.some(task => 
                task.type === 'assignment' && 
                task.name === assignment.name
            )
        );
        
        if (!hasStudyBlock) {
            errors.push(`No study block found for assignment: ${assignment.name}`);
        }
    });

    // Check if all exams have multiple study blocks
    academicTasks.exams.forEach(exam => {
        const studyBlocks = schedule.blocks.filter(block => 
            block.type === 'study' && 
            block.scheduledTasks.some(task => 
                task.type === 'exam' && 
                task.name === exam.topic
            )
        );
        
        if (studyBlocks.length === 0) {
            errors.push(`No study blocks found for exam: ${exam.topic}`);
        } else if (studyBlocks.length < 2) {
            warnings.push(`Only one study block found for exam: ${exam.topic}. Consider adding more preparation time.`);
        }
    });

    return { errors, warnings };
}

// Update the API endpoint
app.post('/api/generate-schedule', async (req, res) => {
    const { preferences, fixedSchedule, academicTasks } = req.body;

    // If no tasks, return predefined blocks and free time
    if ((!academicTasks.assignments || academicTasks.assignments.length === 0) &&
        (!academicTasks.exams || academicTasks.exams.length === 0)) {
        console.log("No tasks found. Generating predefined blocks and free time...");
        
        // Create schedule with just fixed blocks and free time
        const schedule = generateBasicSchedule(preferences, fixedSchedule);
        return res.json({ schedule, warnings: [] });
    }

    try {
        const availableWindows = calculateAvailableWindows(preferences, fixedSchedule, new Date(), academicTasks);
        const promptContent = `
You have these available windows:
${formatAvailableWindows(availableWindows)}

User Info:
- Preferred work hours: ${preferences.preferredWorkHours.join(', ') || 'Flexible'}
- Minimum free time: ${preferences.minFreeTime} hours per day
- Tasks to schedule: 
${formatRequiredTasks(academicTasks)}

Additional Requirements:
- If tasks fit in preferred hours, keep other times as free time
- If tasks exceed preferred hours, you may use non-preferred hours
- Add a "notes" field if you reduce free time, explaining which times and why
- If tasks still cannot fit, note that it's not feasible
- Return valid JSON with "blocks" array and optional "notes" string`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini-2024-07-18',
            messages: [
                { role: 'system', content: systemMessage },
                { role: 'user', content: promptContent }
            ],
            response_format: { 
                type: "json_schema",
                schema: scheduleSchemaDefinition
            }
        });

        const parsedSchedule = JSON.parse(response.choices[0].message.content);
        
        // Validate the schedule
        const validation = validateSchedule(parsedSchedule, academicTasks);
        if (validation.errors.length > 0) {
            return res.status(400).json({ 
                error: 'Generated schedule is incomplete', 
                details: validation.errors,
                warnings: validation.warnings,
                notes: parsedSchedule.notes 
            });
        }

        // Check for overlaps
        const overlaps = checkScheduleOverlaps(parsedSchedule.blocks, fixedSchedule);
        if (overlaps.length > 0) {
            return res.status(400).json({ 
                error: 'Generated schedule has overlaps', 
                overlaps,
                warnings: validation.warnings,
                notes: parsedSchedule.notes
            });
        }

        // Return the schedule with any warnings and notes
        res.json({
            schedule: parsedSchedule,
            warnings: validation.warnings,
            notes: parsedSchedule.notes
        });

    } catch (error) {
        console.error('Error in schedule generation:', error);
        res.status(500).json({ 
            error: 'Failed to generate schedule',
            details: error.message
        });
    }
});

// Helper function to add minutes to a time string
function addMinutesToTime(timeStr, minutes) {
    if (!timeStr || typeof timeStr !== 'string') {
        console.warn(`Invalid time string provided: ${timeStr}`);
        return '00:00';
    }

    if (typeof minutes !== 'number' || isNaN(minutes)) {
        console.warn(`Invalid minutes value: ${minutes}`);
        minutes = 0;
    }

    try {
        const [hours, mins] = timeStr.split(':').map(Number);
        if (isNaN(hours) || isNaN(mins)) {
            console.warn(`Invalid time format: ${timeStr}`);
            return '00:00';
        }

        const date = new Date(2000, 0, 1, hours, mins);
        date.setMinutes(date.getMinutes() + minutes);
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    } catch (error) {
        console.error(`Error adding minutes to time: ${timeStr}`, error);
        return '00:00';
    }
}

// Helper function to convert time string to minutes since midnight
function timeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') {
        console.warn(`Invalid time string provided: ${timeStr}`);
        return 0; // or some default value
    }

    try {
        const [hours, minutes] = timeStr.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) {
            console.warn(`Invalid time format: ${timeStr}`);
            return 0;
        }
        return hours * 60 + minutes;
    } catch (error) {
        console.error(`Error parsing time string: ${timeStr}`, error);
        return 0;
    }
}

// Helper function to check time overlap
function checkTimeOverlap(startTime1, endTime1, startTime2, endTime2) {
    const start1 = new Date(`2000-01-01T${startTime1}`);
    const end1 = new Date(`2000-01-01T${endTime1}`);
    const start2 = new Date(`2000-01-01T${startTime2}`);
    const end2 = new Date(`2000-01-01T${endTime2}`);
    
    return start1 < end2 && end1 > start2; // Check for overlap
}

// Helper function to format academic tasks
function formatAcademicTasks(academicTasks) {
    if (academicTasks.assignments.length === 0 && academicTasks.exams.length === 0) {
        return 'No academic tasks to schedule. Please create a balanced schedule with study and free time blocks.';
    }

    return `
Assignments:
${academicTasks.assignments.map(a => `
- Name: ${a.name}
  Course: ${a.course}
  Topic: ${a.topic}
  Due Date: ${a.dueDate}
  Priority: ${a.priority}
  Student Comment: ${a.comment || 'None'}
`).join('\n')}

Exams:
${academicTasks.exams.map(e => `
- Course: ${e.course}
  Topic: ${e.topic}
  Date: ${e.date}
  Difficulty: ${e.difficulty}
  Student Comment: ${e.comment || 'None'}
`).join('\n')}`;
}

// Helper function to format required tasks
function formatRequiredTasks(academicTasks) {
    let output = '';
    
    if (academicTasks.assignments.length > 0) {
        output += '\nAssignments (each MUST have at least one dedicated study block):\n';
        academicTasks.assignments.forEach(a => {
            output += `- ${a.name} (${a.course})\n  Due: ${a.dueDate}\n  Priority: ${a.priority}\n`;
        });
    }
    
    if (academicTasks.exams.length > 0) {
        output += '\nExams (each MUST have multiple preparation blocks):\n';
        academicTasks.exams.forEach(e => {
            output += `- ${e.course}: ${e.topic}\n  Date: ${e.date}\n  Difficulty: ${e.difficulty}\n`;
        });
    }
    
    return output;
}

// Helper function to generate basic schedule without tasks
function generateBasicSchedule(preferences, fixedSchedule) {
    const blocks = [];
    
    // Add fixed blocks (classes, regular activities)
    if (fixedSchedule.regularBlocks) {
        blocks.push(...fixedSchedule.regularBlocks);
    }
    
    // Calculate available windows and convert to free time blocks
    const availableWindows = calculateAvailableWindows(preferences, fixedSchedule, new Date(), { assignments: [], exams: [] });
    
    // Convert windows to free time blocks
    Object.entries(availableWindows).forEach(([date, slots]) => {
        slots.forEach(slot => {
            blocks.push({
                name: "Free Time",
                date,
                startTime: slot.start,
                endTime: slot.end,
                type: "free",
                scheduledTasks: []
            });
        });
    });
    
    return { blocks };
}

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});