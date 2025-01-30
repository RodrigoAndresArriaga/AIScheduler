let calendar;
let tasks = [];
let currentDate = new Date();
let userPreferences = {
    wakeTime: '07:00',
    bedTime: '23:00',
    preferredHours: [],
    minFreeTime: 2,
    breakDuration: '30',
    classes: [],
    sleepSchedule: {
        sleepTime: '23:00',
        wakeTime: '07:00',
        eveningRoutineStart: '21:00',
        morningRoutineEnd: '08:00',
        eveningRoutine: [
            { id: 'shower', name: 'Shower/Bath', duration: 20 },
            { id: 'skincare', name: 'Skincare', duration: 10 },
            { id: 'reading', name: 'Reading', duration: 30 },
            { id: 'meditation', name: 'Meditation', duration: 15 }
        ],
        morningRoutine: [
            { id: 'stretch', name: 'Stretching', duration: 10 },
            { id: 'hygiene', name: 'Hygiene', duration: 15 },
            { id: 'planning', name: 'Day Planning', duration: 10 },
            { id: 'exercise', name: 'Quick Exercise', duration: 20 }
        ]
    },
    meals: {
        breakfast: '08:00',
        lunch: '12:00',
        dinner: '18:00',
        durations: {
            breakfast: 30,
            lunch: 30,
            dinner: 30
        }
    },
    breaks: {
        frequency: 60,
        duration: 10
    },
    regularBlocks: []
};

document.addEventListener('DOMContentLoaded', function() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'timeGridWeek',
        slotMinTime: '00:00:00',
        slotMaxTime: '24:00:00',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'timeGridWeek,timeGridDay'
        },
        editable: true,
        droppable: true,
        allDaySlot: false,
        height: 'auto',
        slotDuration: '00:15:00',  // 15-minute slots
        snapDuration: '00:05:00',  // 5-minute snap intervals
        eventDrop: function(info) {
            const task = tasks.find(t => t.id === parseInt(info.event.id));
            if (task) {
                task.scheduled = true;
                task.start = info.event.start;
                task.end = info.event.end;
                renderTasks();
            }
        }
    });
    calendar.render();

    if (localStorage.getItem('onboardingComplete') === 'true') {
        document.getElementById('onboarding-wizard').style.display = 'none';
        document.getElementById('main-app').style.display = 'block';
        initializeApp();
    }

    renderRoutineActivities('morning');
    renderRoutineActivities('evening');
});

function addNewTask() {
    const taskName = document.getElementById('taskName').value;
    const taskDuration = Math.max(5, parseInt(document.getElementById('taskDuration').value));
    
    if (taskName && taskDuration) {
        const task = {
            id: Date.now(),
            name: taskName,
            duration: taskDuration,
            completed: false,
            scheduled: false
        };
        tasks.push(task);
        renderTasks();
        
        document.getElementById('taskName').value = '';
        document.getElementById('taskDuration').value = '30';
    }
}

function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        renderTasks();
    }
}

function renderTasks() {
    const tasksDiv = document.getElementById('tasks');
    tasksDiv.innerHTML = tasks
        .filter(task => !task.scheduled)
        .map(task => `
            <div class="task" 
                draggable="true" 
                data-task-id="${task.id}"
                data-event='${JSON.stringify({
                    title: task.name,
                    duration: task.duration
                })}'>
                <input 
                    type="checkbox" 
                    ${task.completed ? 'checked' : ''} 
                    onclick="event.stopPropagation(); toggleTask(${task.id})"
                >
                <span style="${task.completed ? 'text-decoration: line-through' : ''}">
                    ${task.name} (${task.duration}min)
                </span>
            </div>
        `).join('');

    // Add drag listeners to tasks
    document.querySelectorAll('.task').forEach(taskEl => {
        taskEl.addEventListener('dragstart', handleDragStart);
    });
}

function handleDragStart(event) {
    const taskEl = event.target;
    const taskId = taskEl.dataset.taskId;
    const eventData = JSON.parse(taskEl.dataset.event);
    
    event.dataTransfer.setData('text', JSON.stringify({
        taskId: taskId,
        eventData: eventData
    }));
}

// Initialize FullCalendar external events
new FullCalendar.Draggable(document.getElementById('tasks'), {
    itemSelector: '.task',
    eventData: function(eventEl) {
        const data = JSON.parse(eventEl.dataset.event);
        const duration = parseInt(data.duration);
        
        return {
            title: data.title,
            id: eventEl.dataset.taskId,
            duration: {
                minutes: duration
            }
        };
    }
});

// Calendar functions
function renderCalendar() {
    const scheduleDiv = document.getElementById('schedule');
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const hours = Array.from({length: 24}, (_, i) => i);
    
    // Create header
    let html = '<div class="time-label"></div>';
    weekDays.forEach(day => {
        html += `<div class="time-label">${day}</div>`;
    });
    
    // Create time slots
    hours.forEach(hour => {
        html += `<div class="time-label">${hour}:00</div>`;
        weekDays.forEach((day, dayIndex) => {
            const scheduledTask = tasks.find(t => 
                t.scheduled && 
                t.scheduledHour === hour && 
                t.scheduledDay === dayIndex
            );
            
            const heightInSlots = scheduledTask ? 
                Math.ceil(scheduledTask.duration / 60) : 1;
            
            html += `
                <div class="schedule-slot${scheduledTask ? ' has-task' : ''}" 
                    ondragover="allowDrop(event)" 
                    ondrop="dropTask(event)"
                    data-hour="${hour}"
                    data-day="${dayIndex}"
                    style="${scheduledTask ? `height: ${heightInSlots * 60}px;` : ''}">
                    ${scheduledTask ? `
                        <div class="task-overlay" style="height: 100%;">
                            <div class="scheduled-task">
                                ${scheduledTask.name}
                                <br>
                                <small>${scheduledTask.duration}min</small>
                                <div class="remove-task" onclick="removeTask(${scheduledTask.id})">×</div>
                            </div>
                        </div>
                    ` : ''}
                </div>`;
        });
    });
    
    scheduleDiv.innerHTML = html;
    updateCurrentWeek();
}

function updateCurrentWeek() {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    
    document.getElementById('currentWeek').textContent = 
        `${startOfWeek.toLocaleDateString()} - ${endOfWeek.toLocaleDateString()}`;
}

function previousWeek() {
    currentDate.setDate(currentDate.getDate() - 7);
    updateCurrentWeek();
}

function nextWeek() {
    currentDate.setDate(currentDate.getDate() + 7);
    updateCurrentWeek();
}

// Drag and Drop functions
function allowDrop(event) {
    event.preventDefault();
    event.target.classList.add('droppable');
}

function dropTask(event) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData('taskId');
    const task = tasks.find(t => t.id === parseInt(taskId));
    const slot = event.target.closest('.schedule-slot');
    
    if (task && slot) {
        const hour = parseInt(slot.dataset.hour);
        const day = parseInt(slot.dataset.day);
        
        // Check for overlapping tasks
        if (hasOverlap(hour, day, task.duration)) {
            alert('This time slot overlaps with another task!');
            return;
        }
        
        task.scheduled = true;
        task.scheduledHour = hour;
        task.scheduledDay = day;
        
        renderCalendar();
        renderTasks();
    }
    event.target.classList.remove('droppable');
}

// Add function to check for overlapping tasks
function hasOverlap(hour, day, duration) {
    return tasks.some(task => {
        if (!task.scheduled) return false;
        if (task.scheduledDay !== day) return false;
        
        const taskStart = task.scheduledHour;
        const taskEnd = taskStart + Math.ceil(task.duration / 60);
        const newTaskEnd = hour + Math.ceil(duration / 60);
        
        return (hour < taskEnd && newTaskEnd > taskStart);
    });
}

// Add function to remove task from calendar
function removeTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        task.scheduled = false;
        task.scheduledHour = null;
        task.scheduledDay = null;
        renderCalendar();
        renderTasks();
    }
}

function nextStep(currentStep) {
    if (currentStep === 5) {
        // Save sleep schedule and meal preferences
        userPreferences.sleepSchedule = {
            ...userPreferences.sleepSchedule,
            eveningRoutineStart: document.getElementById('eveningRoutineStart').value,
            morningRoutineEnd: document.getElementById('morningRoutineEnd').value
        };

        // Get meal times and durations
        userPreferences.meals = {
            breakfast: document.getElementById('breakfastTime').value,
            lunch: document.getElementById('lunchTime').value,
            dinner: document.getElementById('dinnerTime').value,
            durations: {
                breakfast: parseInt(document.getElementById('breakfastDuration').value) || 30,
                lunch: parseInt(document.getElementById('lunchDuration').value) || 30,
                dinner: parseInt(document.getElementById('dinnerDuration').value) || 30
            }
        };

        // Check for overlaps
        const overlaps = checkScheduleOverlaps();
        if (overlaps.length > 0) {
            const warningMessage = 'The following schedule conflicts were found:\n\n' + 
                overlaps.join('\n') + 
                '\n\nWould you like to continue anyway?';
            
            if (!confirm(warningMessage)) {
                return;
            }
        }

        // Hide current step and show next step
        document.querySelector('[data-step="5"]').style.display = 'none';
        document.querySelector('[data-step="6"]').style.display = 'block';
        return;
    } else if (currentStep === 3) {
        // Save work preferences
        userPreferences.preferredHours = Array.from(document.querySelectorAll('.work-time-select input[type="checkbox"]:checked'))
            .map(cb => cb.value);
        userPreferences.minFreeTime = parseFloat(document.getElementById('minFreeTime').value);
        userPreferences.breaks = {
            frequency: parseInt(document.getElementById('breakFrequency').value),
            duration: parseInt(document.getElementById('breakDuration').value)
        };
    } else if (currentStep === 6) {
        // Check for overlaps before proceeding
        const overlaps = checkScheduleOverlaps();
        if (overlaps.length > 0) {
            const warningMessage = 'The following schedule conflicts were found:\n\n' + 
                overlaps.join('\n') + 
                '\n\nWould you like to continue anyway?';
            
            if (!confirm(warningMessage)) {
                return;
            }
        }
    }

    // Hide current step
    document.querySelector(`[data-step="${currentStep}"]`).style.display = 'none';
    
    // Show next step
    document.querySelector(`[data-step="${currentStep + 1}"]`).style.display = 'block';
}

function prevStep(currentStep) {
    // Hide current step
    document.querySelector(`[data-step="${currentStep}"]`).style.display = 'none';
    // Show previous step
    document.querySelector(`[data-step="${currentStep - 1}"]`).style.display = 'block';
}

function connectCanvas() {
    // TODO: Implement Canvas OAuth2 connection
    alert('Canvas integration will be implemented in the next phase');
    completeOnboarding();
}

function skipCanvas() {
    // Hide current step
    document.querySelector('[data-step="7"]').style.display = 'none';
    
    // Complete onboarding
    completeOnboarding();
}

// Add this helper function to check time overlaps
function checkTimeOverlap(startTime1, endTime1, startTime2, endTime2) {
    const start1 = new Date(`2000-01-01T${startTime1}`);
    const end1 = new Date(`2000-01-01T${endTime1}`);
    const start2 = new Date(`2000-01-01T${startTime2}`);
    const end2 = new Date(`2000-01-01T${endTime2}`);
    
    return start1 < end2 && end1 > start2;
}

// Add this function to check all overlaps
function checkScheduleOverlaps(customBlocks = null) {
    const overlaps = [];
    const schedule = {
        ...userPreferences,
        regularBlocks: customBlocks || userPreferences.regularBlocks
    };
    
    // Check each class and regular block against other time blocks
    const allTimeBlocks = [
        ...schedule.classes.map(cls => ({
            name: cls.name,
            day: cls.day,
            startTime: cls.startTime,
            endTime: cls.endTime,
            type: 'class'
        })),
        ...schedule.regularBlocks.map(block => ({
            name: block.name,
            day: block.day,
            startTime: block.startTime,
            endTime: block.endTime,
            type: block.type
        }))
    ];

    // Check all blocks against each other
    allTimeBlocks.forEach((block1, index) => {
        // Check against morning routine
        if (checkTimeOverlap(
            schedule.sleepSchedule.wakeTime,
            schedule.sleepSchedule.morningRoutineEnd,
            block1.startTime,
            block1.endTime
        )) {
            overlaps.push(`${block1.name} overlaps with morning routine on ${getDayName(block1.day)}`);
        }

        // Check against evening routine
        if (checkTimeOverlap(
            schedule.sleepSchedule.eveningRoutineStart,
            schedule.sleepSchedule.sleepTime,
            block1.startTime,
            block1.endTime
        )) {
            overlaps.push(`${block1.name} overlaps with evening routine on ${getDayName(block1.day)}`);
        }

        // Check against meal times
        ['breakfast', 'lunch', 'dinner'].forEach(meal => {
            const mealStart = schedule.meals[meal];
            const mealEnd = addMinutes(mealStart, 30);
            if (checkTimeOverlap(mealStart, mealEnd, block1.startTime, block1.endTime)) {
                overlaps.push(`${block1.name} overlaps with ${meal} time on ${getDayName(block1.day)}`);
            }
        });

        // Check against other blocks
        allTimeBlocks.forEach((block2, index2) => {
            if (index2 > index && 
                block1.day === block2.day && 
                checkTimeOverlap(block1.startTime, block1.endTime, block2.startTime, block2.endTime)) {
                overlaps.push(`${block1.name} overlaps with ${block2.name} on ${getDayName(block1.day)}`);
            }
        });
    });

    return overlaps;
}

// Helper function to add minutes to time string
function addMinutes(timeStr, minutes) {
    const date = new Date(`2000-01-01T${timeStr}`);
    date.setMinutes(date.getMinutes() + minutes);
    return date.toTimeString().slice(0, 5);
}

// Helper function to get day name
function getDayName(dayNum) {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayNum];
}

// Update the completeOnboarding function to check for overlaps
function completeOnboarding() {
    localStorage.setItem('userPreferences', JSON.stringify(userPreferences));
    localStorage.setItem('onboardingComplete', 'true');
    
    // Schedule study and free time blocks before showing the main app
    scheduleStudyAndFreeTime();
    
    document.getElementById('onboarding-wizard').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    
    initializeApp();
}

// Update addClass function to check for overlaps
function addClass() {
    const name = document.getElementById('className').value;
    const days = Array.from(document.querySelectorAll('.day-checkboxes input[type="checkbox"]:checked'))
        .map(checkbox => parseInt(checkbox.value));
    const startTime = document.getElementById('classStartTime').value;
    const endTime = document.getElementById('classEndTime').value;

    if (name && days.length && startTime && endTime) {
        days.forEach(day => {
            const newClass = { 
                id: Date.now() + day,
                name,
                day,
                startTime,
                endTime
            };
            userPreferences.classes.push(newClass);
        });
        
        renderClassList();
        clearClassForm();
    } else {
        alert('Please fill in all fields and select at least one day');
    }
}

function renderClassList() {
    const classList = document.getElementById('classList');
    const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    
    // Group classes by name for display
    const groupedClasses = {};
    userPreferences.classes.forEach(cls => {
        if (!groupedClasses[cls.name]) {
            groupedClasses[cls.name] = {
                name: cls.name,
                days: [cls.day],
                startTime: cls.startTime,
                endTime: cls.endTime
            };
        } else if (!groupedClasses[cls.name].days.includes(cls.day)) {
            groupedClasses[cls.name].days.push(cls.day);
        }
    });
    
    classList.innerHTML = Object.values(groupedClasses).map(cls => `
        <div class="class-item" data-class-name="${cls.name}">
            <div class="class-info">
                <h4>${cls.name}</h4>
                <p>Days: ${cls.days.sort().map(d => dayNames[d]).join(', ')}</p>
                <p>Time: ${formatTime(cls.startTime)} - ${formatTime(cls.endTime)}</p>
            </div>
            <div class="class-actions">
                <button onclick="editClass('${cls.name}')" class="edit-btn">Edit</button>
                <button onclick="deleteClass('${cls.name}')" class="delete-btn">×</button>
            </div>
        </div>
    `).join('');
}

function editClass(className) {
    const classInstances = userPreferences.classes.filter(c => c.name === className);
    if (!classInstances.length) return;

    const firstInstance = classInstances[0];
    const selectedDays = classInstances.map(c => c.day);

    const classItem = document.querySelector(`[data-class-name="${className}"]`);
    classItem.innerHTML = `
        <div class="class-edit-form">
            <input type="text" value="${firstInstance.name}" class="edit-class-name">
            <div class="day-select">
                <label>Select Days:</label>
                <div class="day-checkboxes">
                    <label><input type="checkbox" value="1" ${selectedDays.includes(1) ? 'checked' : ''}> Monday</label>
                    <label><input type="checkbox" value="2" ${selectedDays.includes(2) ? 'checked' : ''}> Tuesday</label>
                    <label><input type="checkbox" value="3" ${selectedDays.includes(3) ? 'checked' : ''}> Wednesday</label>
                    <label><input type="checkbox" value="4" ${selectedDays.includes(4) ? 'checked' : ''}> Thursday</label>
                    <label><input type="checkbox" value="5" ${selectedDays.includes(5) ? 'checked' : ''}> Friday</label>
                </div>
            </div>
            <div class="time-group">
                <input type="time" value="${firstInstance.startTime}" class="edit-start-time">
                <span>to</span>
                <input type="time" value="${firstInstance.endTime}" class="edit-end-time">
            </div>
            <div class="edit-actions">
                <button onclick="saveClassEdit('${className}')">Save</button>
                <button onclick="renderClassList()">Cancel</button>
            </div>
        </div>
    `;
}

function saveClassEdit(className) {
    const classItem = document.querySelector(`[data-class-name="${className}"]`);
    const newName = classItem.querySelector('.edit-class-name').value;
    const selectedDays = Array.from(classItem.querySelectorAll('.day-checkboxes input[type="checkbox"]:checked'))
        .map(checkbox => parseInt(checkbox.value));
    const startTime = classItem.querySelector('.edit-start-time').value;
    const endTime = classItem.querySelector('.edit-end-time').value;

    if (newName && selectedDays.length && startTime && endTime) {
        // Remove all instances of this class
        userPreferences.classes = userPreferences.classes.filter(c => c.name !== className);
        
        // Add new instances for each selected day
        selectedDays.forEach(day => {
            userPreferences.classes.push({
                id: Date.now() + day,
                name: newName,
                day,
                startTime,
                endTime
            });
        });

        renderClassList();
        initializeApp(); // Refresh calendar
    } else {
        alert('Please fill in all fields and select at least one day');
    }
}

function deleteClass(className) {
    userPreferences.classes = userPreferences.classes.filter(c => c.name !== className);
    renderClassList();
    initializeApp(); // Refresh calendar
}

function importFromFile() {
    document.getElementById('calendarFile').click();
}

// Add event listener for file input
document.getElementById('calendarFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            // Parse .ics file and add classes
            parseICSFile(e.target.result);
        };
        reader.readAsText(file);
    }
});

function parseICSFile(icsData) {
    // TODO: Implement ICS parsing
    // For now, just show an alert
    alert('Calendar import will be implemented in the next phase');
}

function initializeApp() {
    // Clear existing events and event listeners
    calendar.removeAllEvents();
    calendar.removeAllEventSources();
    calendar.off('eventClick'); // Remove existing click handlers

    // Set calendar time range based on sleep schedule
    const wakeTime = userPreferences.sleepSchedule.wakeTime;
    const sleepTime = userPreferences.sleepSchedule.sleepTime;
    
    // Adjust visible time range to show only awake hours
    calendar.setOption('slotMinTime', wakeTime);
    calendar.setOption('slotMaxTime', sleepTime);

    // Add classes to calendar
    userPreferences.classes.forEach(cls => {
        calendar.addEvent({
            title: cls.name,
            daysOfWeek: [cls.day],
            startTime: cls.startTime,
            endTime: cls.endTime,
            backgroundColor: '#1976D2',
            borderColor: '#1976D2'
        });
    });

    // Add regular blocks to calendar
    userPreferences.regularBlocks.forEach(block => {
        calendar.addEvent({
            title: block.name,
            daysOfWeek: [block.day],
            startTime: block.startTime,
            endTime: block.endTime,
            backgroundColor: getTypeColor(block.type),
            borderColor: getTypeColor(block.type),
            extendedProps: {
                type: block.type
            }
        });
    });

    // Add routine blocks
    const addRoutineBlock = (title, startTime, endTime, activities) => {
        calendar.addEvent({
            title: title,
            startTime: startTime,
            endTime: endTime,
            daysOfWeek: [1,2,3,4,5], // Monday to Friday
            backgroundColor: '#9C27B0',
            borderColor: '#9C27B0',
            extendedProps: {
                type: 'routine',
                activities: activities
            }
        });
    };

    // Add morning routine
    addRoutineBlock(
        'Morning Routine',
        userPreferences.sleepSchedule.wakeTime,
        userPreferences.sleepSchedule.morningRoutineEnd,
        userPreferences.sleepSchedule.morningRoutine
    );

    // Add evening routine
    addRoutineBlock(
        'Evening Routine',
        userPreferences.sleepSchedule.eveningRoutineStart,
        userPreferences.sleepSchedule.sleepTime,
        userPreferences.sleepSchedule.eveningRoutine
    );

    // Add meal times with custom durations
    ['breakfast', 'lunch', 'dinner'].forEach(meal => {
        const mealTime = userPreferences.meals[meal];
        const duration = userPreferences.meals.durations[meal];
        calendar.addEvent({
            title: `${meal.charAt(0).toUpperCase() + meal.slice(1)}`,
            startTime: mealTime,
            endTime: addMinutes(mealTime, duration),
            daysOfWeek: [1,2,3,4,5],
            backgroundColor: '#FF9800',
            borderColor: '#FF9800',
            extendedProps: {
                type: 'meal'
            }
        });
    });

    // Add click handler for events (now only added once)
    calendar.on('eventClick', function(info) {
        showBlockDetails(info.event);
    });
}

// Add function to show block details
function showBlockDetails(event) {
    // Remove any existing modals first
    const existingModals = document.querySelectorAll('.block-details-modal');
    existingModals.forEach(modal => modal.remove());

    let content = '';
    const type = event.extendedProps.type;

    if (type === 'routine') {
        const activities = event.extendedProps.activities;
        content = `
            <h3>${event.title}</h3>
            <div class="routine-activities-list">
                ${activities.map(activity => `
                    <div class="routine-activity-item">
                        <span>${activity.name}</span>
                        <span>${activity.duration} min</span>
                    </div>
                `).join('')}
            </div>
        `;
    } else if (type === 'meal') {
        const mealType = event.title.toLowerCase();
        content = `
            <h3>${event.title}</h3>
            <p>Duration: ${userPreferences.meals.durations[mealType]} minutes</p>
        `;
    } else {
        content = `
            <h3>${event.title}</h3>
            <p>Time: ${formatTime(event.startStr)} - ${formatTime(event.endStr)}</p>
            <p>Type: ${type.charAt(0).toUpperCase() + type.slice(1)}</p>
        `;
    }

    // Show modal with content
    const modal = document.createElement('div');
    modal.className = 'block-details-modal';
    modal.innerHTML = `
        <div class="modal-content">
            ${content}
            <button onclick="closeBlockDetails(this)">Close</button>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeBlockDetails(button) {
    const modal = button.closest('.block-details-modal');
    if (modal) {
        modal.remove();
    }
}

function logout() {
    // Clear all stored data
    localStorage.clear();
    
    // Reset userPreferences to default
    userPreferences = {
        wakeTime: '07:00',
        bedTime: '23:00',
        preferredHours: [],
        minFreeTime: 2,
        breakDuration: '30',
        classes: [],
        sleepSchedule: {
            sleepTime: '23:00',
            wakeTime: '07:00',
            eveningRoutineStart: '21:00',
            morningRoutineEnd: '08:00',
            eveningRoutine: [
                { id: 'shower', name: 'Shower/Bath', duration: 20 },
                { id: 'skincare', name: 'Skincare', duration: 10 },
                { id: 'reading', name: 'Reading', duration: 30 },
                { id: 'meditation', name: 'Meditation', duration: 15 }
            ],
            morningRoutine: [
                { id: 'stretch', name: 'Stretching', duration: 10 },
                { id: 'hygiene', name: 'Hygiene', duration: 15 },
                { id: 'planning', name: 'Day Planning', duration: 10 },
                { id: 'exercise', name: 'Quick Exercise', duration: 20 }
            ]
        },
        meals: {
            breakfast: '08:00',
            lunch: '12:00',
            dinner: '18:00',
            durations: {
                breakfast: 30,
                lunch: 30,
                dinner: 30
            }
        },
        breaks: {
            frequency: 60,
            duration: 10
        },
        regularBlocks: []
    };

    // Clear tasks
    tasks = [];

    // Hide main app and show onboarding
    document.getElementById('main-app').style.display = 'none';
    document.getElementById('onboarding-wizard').style.display = 'block';
    
    // Reset to first step of onboarding
    document.querySelectorAll('.onboarding-step').forEach(step => {
        step.style.display = 'none';
    });
    document.querySelector('[data-step="1"]').style.display = 'block';

    // Refresh the page to ensure clean state
    window.location.reload();
}

function addCustomActivity(routineType) {
    const inputId = `custom${routineType.charAt(0).toUpperCase() + routineType.slice(1)}Activity`;
    const input = document.getElementById(inputId);
    const activity = input.value.trim();
    
    if (activity) {
        const newActivity = {
            id: Date.now(),
            name: activity,
            duration: 15 // default duration in minutes
        };
        userPreferences.sleepSchedule[`${routineType}Routine`].push(newActivity);
        input.value = '';
        renderRoutineActivities(routineType);
        
        // Save to localStorage
        localStorage.setItem('userPreferences', JSON.stringify(userPreferences));
    }
}

function renderRoutineActivities(routineType) {
    const container = document.querySelector(`.routine-section:${routineType === 'morning' ? 'last-child' : 'first-child'} .routine-activities`);
    const activities = userPreferences.sleepSchedule[`${routineType}Routine`];
    
    // Render predefined activities
    const predefinedContainer = container.querySelector('.predefined-activities');
    predefinedContainer.innerHTML = activities.map(activity => `
        <div class="activity-item" draggable="true" data-activity-id="${activity.id}">
            <div class="activity-info">
                <div class="drag-handle">⋮⋮</div>
                <label>
                    <input type="checkbox" checked>
                    <span>${activity.name}</span>
                </label>
                <span class="duration">${activity.duration}min</span>
            </div>
            <div class="activity-actions">
                <button onclick="editActivity('${routineType}', '${activity.id}')" class="edit-btn">Edit</button>
                <button onclick="deleteActivity('${routineType}', '${activity.id}')" class="delete-btn">×</button>
            </div>
        </div>
    `).join('');

    // Add drag and drop listeners
    const activityItems = predefinedContainer.querySelectorAll('.activity-item');
    activityItems.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);
    });
}

// Drag and drop handlers
let draggedItem = null;
let routineType = null;

function handleDragStart(e) {
    draggedItem = e.target;
    routineType = draggedItem.closest('.routine-section').querySelector('label').textContent.toLowerCase().includes('morning') ? 'morning' : 'evening';
    e.target.classList.add('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
    const item = e.target.closest('.activity-item');
    if (!item || item === draggedItem) return;

    const rect = item.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const dropPosition = e.clientY < midpoint ? 'before' : 'after';
    
    // Remove existing drop markers
    item.classList.remove('drop-before', 'drop-after');
    item.classList.add(`drop-${dropPosition}`);
}

function handleDrop(e) {
    e.preventDefault();
    const dropTarget = e.target.closest('.activity-item');
    if (!dropTarget || dropTarget === draggedItem) return;

    const activities = userPreferences.sleepSchedule[`${routineType}Routine`];
    const draggedIndex = activities.findIndex(a => a.id.toString() === draggedItem.dataset.activityId);
    const dropIndex = activities.findIndex(a => a.id.toString() === dropTarget.dataset.activityId);
    
    const rect = dropTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const insertAfter = e.clientY > midpoint;
    
    // Reorder the array
    const [removed] = activities.splice(draggedIndex, 1);
    activities.splice(insertAfter ? dropIndex + 1 : dropIndex, 0, removed);
    
    // Save to localStorage
    localStorage.setItem('userPreferences', JSON.stringify(userPreferences));
    
    // Re-render the list
    renderRoutineActivities(routineType);
}

function handleDragEnd(e) {
    const activityItems = document.querySelectorAll('.activity-item');
    activityItems.forEach(item => {
        item.classList.remove('drop-before', 'drop-after', 'dragging');
    });
    draggedItem = null;
    routineType = null;
}

function editActivity(routineType, activityId) {
    const activities = userPreferences.sleepSchedule[`${routineType}Routine`];
    const activity = activities.find(a => a.id.toString() === activityId.toString());
    if (!activity) return;

    const activityItem = document.querySelector(`[data-activity-id="${activityId}"]`);
    activityItem.innerHTML = `
        <div class="activity-edit-form">
            <input type="text" value="${activity.name}" class="edit-activity-name">
            <input type="number" value="${activity.duration}" min="5" step="5" class="edit-activity-duration">
            <div class="edit-actions">
                <button onclick="saveActivityEdit('${routineType}', '${activityId}')">Save</button>
                <button onclick="renderRoutineActivities('${routineType}')">Cancel</button>
            </div>
        </div>
    `;
}

function saveActivityEdit(routineType, activityId) {
    const activityItem = document.querySelector(`[data-activity-id="${activityId}"]`);
    const name = activityItem.querySelector('.edit-activity-name').value;
    const duration = parseInt(activityItem.querySelector('.edit-activity-duration').value);

    if (name && duration) {
        const activities = userPreferences.sleepSchedule[`${routineType}Routine`];
        const index = activities.findIndex(a => a.id.toString() === activityId.toString());
        if (index !== -1) {
            activities[index] = { 
                id: activityId, 
                name, 
                duration 
            };
            renderRoutineActivities(routineType);
            
            // Save to localStorage
            localStorage.setItem('userPreferences', JSON.stringify(userPreferences));
        }
    } else {
        alert('Please fill in both name and duration');
    }
}

function deleteActivity(routineType, activityId) {
    userPreferences.sleepSchedule[`${routineType}Routine`] = 
        userPreferences.sleepSchedule[`${routineType}Routine`].filter(a => a.id !== activityId);
    renderRoutineActivities(routineType);
    
    // Save to localStorage
    localStorage.setItem('userPreferences', JSON.stringify(userPreferences));
}

function clearClassForm() {
    document.getElementById('className').value = '';
    document.querySelectorAll('.day-checkboxes input[type="checkbox"]')
        .forEach(checkbox => checkbox.checked = false);
    document.getElementById('classStartTime').value = '';
    document.getElementById('classEndTime').value = '';
}

function formatTime(time) {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString([], { 
        hour: 'numeric', 
        minute: '2-digit' 
    });
}

function addRegularBlock() {
    const name = document.getElementById('blockName').value;
    const days = Array.from(document.querySelectorAll('.day-checkboxes input[type="checkbox"]:checked'))
        .map(checkbox => parseInt(checkbox.value));
    const startTime = document.getElementById('blockStartTime').value;
    const endTime = document.getElementById('blockEndTime').value;
    const type = document.getElementById('blockType').value;

    if (name && days.length && startTime && endTime) {
        // Temporarily add the new blocks to check for overlaps
        const tempBlocks = [...userPreferences.regularBlocks];
        days.forEach(day => {
            tempBlocks.push({ 
                id: Date.now() + day,
                name,
                day,
                startTime,
                endTime,
                type
            });
        });

        // Check for overlaps with temporary blocks
        const overlaps = checkScheduleOverlaps(tempBlocks);
        if (overlaps.length > 0) {
            const warningMessage = 'The following schedule conflicts were found:\n\n' + 
                overlaps.join('\n') + 
                '\n\nWould you like to add this activity anyway?';
            
            if (!confirm(warningMessage)) {
                return;
            }
        }

        // If user confirms or no overlaps, add the blocks
        days.forEach(day => {
            userPreferences.regularBlocks.push({ 
                id: Date.now() + day,
                name,
                day,
                startTime,
                endTime,
                type
            });
        });
        
        renderRegularBlocks();
        clearBlockForm();
    } else {
        alert('Please fill in all fields and select at least one day');
    }
}

function renderRegularBlocks() {
    const blocksList = document.getElementById('regularBlocksList');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Group blocks by name for display
    const groupedBlocks = {};
    userPreferences.regularBlocks.forEach(block => {
        if (!groupedBlocks[block.name]) {
            groupedBlocks[block.name] = {
                name: block.name,
                days: [block.day],
                startTime: block.startTime,
                endTime: block.endTime,
                type: block.type
            };
        } else if (!groupedBlocks[block.name].days.includes(block.day)) {
            groupedBlocks[block.name].days.push(block.day);
        }
    });
    
    const getTypeColor = (type) => {
        const colors = {
            work: '#4CAF50',
            exercise: '#FF9800',
            hobby: '#9C27B0',
            free: '#2196F3',
            important: '#F44336'
        };
        return colors[type] || '#757575';
    };

    blocksList.innerHTML = Object.values(groupedBlocks).map(block => `
        <div class="class-item" data-block-name="${block.name}">
            <div class="class-info">
                <h4 style="color: ${getTypeColor(block.type)}">${block.name}</h4>
                <p>Days: ${block.days.sort().map(d => dayNames[d]).join(', ')}</p>
                <p>Time: ${formatTime(block.startTime)} - ${formatTime(block.endTime)}</p>
            </div>
            <div class="class-actions">
                <button onclick="editRegularBlock('${block.name}')" class="edit-btn">Edit</button>
                <button onclick="deleteRegularBlock('${block.name}')" class="delete-btn">×</button>
            </div>
        </div>
    `).join('');
}

function clearBlockForm() {
    document.getElementById('blockName').value = '';
    document.querySelectorAll('.day-checkboxes input[type="checkbox"]')
        .forEach(checkbox => checkbox.checked = false);
    document.getElementById('blockStartTime').value = '';
    document.getElementById('blockEndTime').value = '';
    document.getElementById('blockType').selectedIndex = 0;
}

// Add edit and delete functions similar to class management
function editRegularBlock(blockName) {
    const blockInstances = userPreferences.regularBlocks.filter(b => b.name === blockName);
    if (!blockInstances.length) return;

    const firstInstance = blockInstances[0];
    const selectedDays = blockInstances.map(b => b.day);

    const blockItem = document.querySelector(`[data-block-name="${blockName}"]`);
    blockItem.innerHTML = `
        <div class="block-edit-form">
            <input type="text" value="${firstInstance.name}" class="edit-block-name">
            <div class="day-select">
                <label>Select Days:</label>
                <div class="day-checkboxes">
                    <label><input type="checkbox" value="1" ${selectedDays.includes(1) ? 'checked' : ''}> Monday</label>
                    <label><input type="checkbox" value="2" ${selectedDays.includes(2) ? 'checked' : ''}> Tuesday</label>
                    <label><input type="checkbox" value="3" ${selectedDays.includes(3) ? 'checked' : ''}> Wednesday</label>
                    <label><input type="checkbox" value="4" ${selectedDays.includes(4) ? 'checked' : ''}> Thursday</label>
                    <label><input type="checkbox" value="5" ${selectedDays.includes(5) ? 'checked' : ''}> Friday</label>
                    <label><input type="checkbox" value="6" ${selectedDays.includes(6) ? 'checked' : ''}> Saturday</label>
                    <label><input type="checkbox" value="0" ${selectedDays.includes(0) ? 'checked' : ''}> Sunday</label>
                </div>
            </div>
            <div class="time-group">
                <input type="time" value="${firstInstance.startTime}" class="edit-start-time">
                <span>to</span>
                <input type="time" value="${firstInstance.endTime}" class="edit-end-time">
            </div>
            <div class="block-type">
                <label>Activity Type:</label>
                <select class="edit-block-type">
                    <option value="work" ${firstInstance.type === 'work' ? 'selected' : ''}>Work/Internship</option>
                    <option value="exercise" ${firstInstance.type === 'exercise' ? 'selected' : ''}>Exercise/Sports</option>
                    <option value="hobby" ${firstInstance.type === 'hobby' ? 'selected' : ''}>Hobbies</option>
                    <option value="free" ${firstInstance.type === 'free' ? 'selected' : ''}>Free Time</option>
                    <option value="important" ${firstInstance.type === 'important' ? 'selected' : ''}>Important</option>
                </select>
            </div>
            <div class="edit-actions">
                <button onclick="saveBlockEdit('${blockName}')">Save</button>
                <button onclick="renderRegularBlocks()">Cancel</button>
            </div>
        </div>
    `;
}

function saveBlockEdit(blockName) {
    const blockItem = document.querySelector(`[data-block-name="${blockName}"]`);
    const newName = blockItem.querySelector('.edit-block-name').value;
    const selectedDays = Array.from(blockItem.querySelectorAll('.day-checkboxes input[type="checkbox"]:checked'))
        .map(checkbox => parseInt(checkbox.value));
    const startTime = blockItem.querySelector('.edit-start-time').value;
    const endTime = blockItem.querySelector('.edit-end-time').value;
    const type = blockItem.querySelector('.edit-block-type').value;

    if (newName && selectedDays.length && startTime && endTime) {
        // Remove old instances
        userPreferences.regularBlocks = userPreferences.regularBlocks.filter(b => b.name !== blockName);
        
        // Add new instances
        selectedDays.forEach(day => {
            userPreferences.regularBlocks.push({
                id: Date.now() + day,
                name: newName,
                day,
                startTime,
                endTime,
                type
            });
        });

        // Check for overlaps
        const overlaps = checkScheduleOverlaps();
        if (overlaps.length > 0) {
            const warningMessage = 'The following schedule conflicts were found:\n\n' + 
                overlaps.join('\n') + 
                '\n\nWould you like to save these changes anyway?';
            
            if (!confirm(warningMessage)) {
                renderRegularBlocks();
                return;
            }
        }

        renderRegularBlocks();
        initializeApp(); // Refresh calendar
    }
}

function deleteRegularBlock(blockName) {
    userPreferences.regularBlocks = userPreferences.regularBlocks.filter(b => b.name !== blockName);
    renderRegularBlocks();
    initializeApp(); // Refresh calendar
}

function getTypeColor(type) {
    const colors = {
        work: '#4CAF50',
        exercise: '#FF9800',
        hobby: '#9C27B0',
        free: '#2196F3',
        important: '#F44336'
    };
    return colors[type] || '#757575';
}

// Add this function to find available time slots
function findAvailableTimeSlots() {
    const availableSlots = {
        morning: [],   // 8AM-12PM
        afternoon: [], // 12PM-5PM
        evening: []    // 5PM-10PM
    };

    // Helper function to get time period
    function getTimePeriod(time) {
        const hour = parseInt(time.split(':')[0]);
        if (hour >= 8 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 17) return 'afternoon';
        if (hour >= 17 && hour < 22) return 'evening';
        return null;
    }

    // Get all fixed blocks for each day
    [1,2,3,4,5].forEach(day => {
        // Collect all fixed blocks for this day
        const fixedBlocks = [
            // Classes
            ...userPreferences.classes
                .filter(cls => cls.day === day)
                .map(cls => ({
                    start: cls.startTime,
                    end: cls.endTime
                })),
            // Regular activities (gym, work, etc.)
            ...userPreferences.regularBlocks
                .filter(block => block.day === day && block.type !== 'study' && block.type !== 'free')
                .map(block => ({
                    start: block.startTime,
                    end: block.endTime
                })),
            // Meals with custom durations
            {
                start: userPreferences.meals.breakfast,
                end: addMinutes(userPreferences.meals.breakfast, userPreferences.meals.durations.breakfast)
            },
            {
                start: userPreferences.meals.lunch,
                end: addMinutes(userPreferences.meals.lunch, userPreferences.meals.durations.lunch)
            },
            {
                start: userPreferences.meals.dinner,
                end: addMinutes(userPreferences.meals.dinner, userPreferences.meals.durations.dinner)
            },
            // Routines
            {
                start: userPreferences.sleepSchedule.wakeTime,
                end: userPreferences.sleepSchedule.morningRoutineEnd
            },
            {
                start: userPreferences.sleepSchedule.eveningRoutineStart,
                end: userPreferences.sleepSchedule.sleepTime
            }
        ].sort((a, b) => a.start.localeCompare(b.start));

        // Find gaps between fixed blocks
        let currentTime = '08:00';
        const endTime = '21:00';

        fixedBlocks.forEach(block => {
            if (currentTime < block.start) {
                const duration = getTimeDuration(currentTime, block.start);
                // Only add slots that are at least 15 minutes long
                if (duration >= 0.25) { // 15 minutes = 0.25 hours
                    const period = getTimePeriod(currentTime);
                    if (period) {
                        availableSlots[period].push({
                            day,
                            startTime: currentTime,
                            endTime: block.start,
                            duration: duration
                        });
                    }
                }
            }
            currentTime = block.end;
        });

        // Add final slot if there's time after last block
        if (currentTime < endTime) {
            const duration = getTimeDuration(currentTime, endTime);
            if (duration >= 0.25) {
                const period = getTimePeriod(currentTime);
                if (period) {
                    availableSlots[period].push({
                        day,
                        startTime: currentTime,
                        endTime: endTime,
                        duration: duration
                    });
                }
            }
        }
    });

    return availableSlots;
}

// Update scheduleStudyAndFreeTime to include logging
function scheduleStudyAndFreeTime() {
    console.log('Starting scheduling process...');
    
    // Clear existing auto-generated blocks
    userPreferences.regularBlocks = userPreferences.regularBlocks.filter(
        block => block.type !== 'study' && block.type !== 'free'
    );

    const availableSlots = findAvailableTimeSlots();
    const preferredHours = Array.isArray(userPreferences.preferredHours) ? 
        userPreferences.preferredHours : [];
    const minFreeTime = userPreferences.minFreeTime || 2;
    let totalFreeTimeHours = 0;

    console.log('Available slots:', availableSlots);
    console.log('Preferred hours:', preferredHours);

    // First, try to use small gaps (15-30 minutes) near meal times as free time
    Object.keys(availableSlots).forEach(timeOfDay => {
        availableSlots[timeOfDay].forEach(slot => {
            // Check if this is a small gap (15-30 minutes) near a meal
            const isNearMeal = ['breakfast', 'lunch', 'dinner'].some(meal => {
                const mealTime = userPreferences.meals[meal];
                const mealEnd = addMinutes(mealTime, userPreferences.meals.durations[meal]);
                return (
                    (Math.abs(getTimeDuration(slot.startTime, mealTime)) <= 0.5) || // Within 30 min before meal
                    (Math.abs(getTimeDuration(mealEnd, slot.endTime)) <= 0.5)       // Within 30 min after meal
                );
            });

            if (isNearMeal && slot.duration <= 0.5) { // 30 minutes or less
                userPreferences.regularBlocks.push({
                    id: Date.now() + Math.random(),
                    name: 'Free Time',
                    day: slot.day,
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                    type: 'free'
                });
                totalFreeTimeHours += slot.duration;
                // Remove this slot from available slots
                const index = availableSlots[timeOfDay].indexOf(slot);
                if (index > -1) {
                    availableSlots[timeOfDay].splice(index, 1);
                }
            }
        });
    });

    // Then allocate remaining free time in non-preferred hours
    const nonPreferredTimes = Object.keys(availableSlots).filter(time => !preferredHours.includes(time));
    
    nonPreferredTimes.forEach(timeOfDay => {
        if (totalFreeTimeHours >= minFreeTime * 5) return;
        
        availableSlots[timeOfDay].forEach(slot => {
            if (totalFreeTimeHours >= minFreeTime * 5) return;
            
            userPreferences.regularBlocks.push({
                id: Date.now() + Math.random(),
                name: 'Free Time',
                day: slot.day,
                startTime: slot.startTime,
                endTime: slot.endTime,
                type: 'free'
            });
            totalFreeTimeHours += slot.duration;
        });
    });

    // Check if there are any academic tasks before creating study blocks
    const hasAcademicTasks = tasks.some(task => !task.completed);

    // Only create study blocks if there are academic tasks
    if (hasAcademicTasks) {
        // Fill remaining slots with study blocks
        Object.keys(availableSlots).forEach(timeOfDay => {
            availableSlots[timeOfDay].forEach(slot => {
                // Skip if slot is too short (less than 15 minutes)
                if (slot.duration < 0.25) return;

                // Check if this slot isn't already used for free time
                const isSlotUsed = userPreferences.regularBlocks.some(block => 
                    block.day === slot.day && 
                    block.startTime === slot.startTime && 
                    block.endTime === slot.endTime
                );

                if (!isSlotUsed) {
                    userPreferences.regularBlocks.push({
                        id: Date.now() + Math.random(),
                        name: 'Study Block',
                        day: slot.day,
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                        type: 'study'
                    });
                }
            });
        });
    } else {
        // If no academic tasks, make all remaining slots free time
        Object.keys(availableSlots).forEach(timeOfDay => {
            availableSlots[timeOfDay].forEach(slot => {
                // Skip if slot is too short (less than 15 minutes)
                if (slot.duration < 0.25) return;

                // Check if this slot isn't already used
                const isSlotUsed = userPreferences.regularBlocks.some(block => 
                    block.day === slot.day && 
                    block.startTime === slot.startTime && 
                    block.endTime === slot.endTime
                );

                if (!isSlotUsed) {
                    userPreferences.regularBlocks.push({
                        id: Date.now() + Math.random(),
                        name: 'Free Time',
                        day: slot.day,
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                        type: 'free'
                    });
                }
            });
        });
    }

    console.log('Final blocks:', userPreferences.regularBlocks);

    // Update calendar
    renderRegularBlocks();
    initializeApp();
}

// Add a function to get the duration between two times in hours
function getTimeDuration(startTime, endTime) {
    const start = new Date(`2000-01-01T${startTime}`);
    const end = new Date(`2000-01-01T${endTime}`);
    return (end - start) / (1000 * 60 * 60); // Convert milliseconds to hours
}

// Helper functions for time manipulation
function addMinutes(time, minutes) {
    const [hours, mins] = time.split(':').map(Number);
    const date = new Date(2000, 0, 1, hours, mins + minutes);
    return date.toTimeString().slice(0, 5);
}

function subtractMinutes(time, minutes) {
    const [hours, mins] = time.split(':').map(Number);
    const date = new Date(2000, 0, 1, hours, mins - minutes);
    return date.toTimeString().slice(0, 5);
} 