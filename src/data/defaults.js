// Default exercise library
export const defaultExercises = [
  // Chest
  { id: 'ex_bench_press', name: 'Barbell Bench Press', category: 'chest', equipment: 'barbell', muscles: ['chest', 'triceps', 'shoulders'], instructions: 'Lie on a flat bench, grip barbell slightly wider than shoulder-width. Lower to chest, press up.' },
  { id: 'ex_incline_bench', name: 'Incline Dumbbell Press', category: 'chest', equipment: 'dumbbell', muscles: ['upper chest', 'shoulders', 'triceps'], instructions: 'Set bench to 30-45°. Press dumbbells up from chest level.' },
  { id: 'ex_pushups', name: 'Push-ups', category: 'chest', equipment: 'bodyweight', muscles: ['chest', 'triceps', 'shoulders'], instructions: 'Hands shoulder-width apart, lower chest to floor, push up. Keep body straight.' },
  { id: 'ex_chest_fly', name: 'Dumbbell Fly', category: 'chest', equipment: 'dumbbell', muscles: ['chest'], instructions: 'Lie flat, extend arms with slight bend, lower dumbbells in arc to sides, squeeze back up.' },
  // Back
  { id: 'ex_deadlift', name: 'Deadlift', category: 'back', equipment: 'barbell', muscles: ['back', 'hamstrings', 'glutes'], instructions: 'Stand with feet hip-width, grip bar, lift by extending hips and knees. Keep back straight.' },
  { id: 'ex_pullups', name: 'Pull-ups', category: 'back', equipment: 'bodyweight', muscles: ['lats', 'biceps', 'back'], instructions: 'Grip bar overhand, pull chin above bar, lower with control.' },
  { id: 'ex_barbell_row', name: 'Barbell Row', category: 'back', equipment: 'barbell', muscles: ['back', 'biceps'], instructions: 'Bend at hips, pull bar to lower chest, squeeze shoulder blades.' },
  { id: 'ex_lat_pulldown', name: 'Lat Pulldown', category: 'back', equipment: 'cable', muscles: ['lats', 'biceps'], instructions: 'Grip wide, pull bar to upper chest, control the return.' },
  // Shoulders
  { id: 'ex_ohp', name: 'Overhead Press', category: 'shoulders', equipment: 'barbell', muscles: ['shoulders', 'triceps'], instructions: 'Press barbell from shoulder level overhead. Keep core tight.' },
  { id: 'ex_lateral_raise', name: 'Lateral Raise', category: 'shoulders', equipment: 'dumbbell', muscles: ['shoulders'], instructions: 'Raise dumbbells to sides until arms are parallel to floor.' },
  { id: 'ex_face_pull', name: 'Face Pull', category: 'shoulders', equipment: 'cable', muscles: ['rear delts', 'upper back'], instructions: 'Pull rope attachment to face level, squeeze shoulder blades.' },
  // Arms
  { id: 'ex_barbell_curl', name: 'Barbell Curl', category: 'arms', equipment: 'barbell', muscles: ['biceps'], instructions: 'Curl barbell from thighs to shoulders, keeping elbows fixed.' },
  { id: 'ex_tricep_pushdown', name: 'Tricep Pushdown', category: 'arms', equipment: 'cable', muscles: ['triceps'], instructions: 'Push cable attachment down until arms are straight.' },
  { id: 'ex_hammer_curl', name: 'Hammer Curl', category: 'arms', equipment: 'dumbbell', muscles: ['biceps', 'forearms'], instructions: 'Curl dumbbells with neutral grip (palms facing each other).' },
  // Legs
  { id: 'ex_squat', name: 'Barbell Squat', category: 'legs', equipment: 'barbell', muscles: ['quads', 'glutes', 'hamstrings'], instructions: 'Bar on upper back, squat until thighs parallel, drive up through heels.' },
  { id: 'ex_leg_press', name: 'Leg Press', category: 'legs', equipment: 'machine', muscles: ['quads', 'glutes'], instructions: 'Place feet shoulder-width on platform, press and control the descent.' },
  { id: 'ex_lunges', name: 'Walking Lunges', category: 'legs', equipment: 'dumbbell', muscles: ['quads', 'glutes'], instructions: 'Step forward into lunge, alternate legs while walking.' },
  { id: 'ex_rdl', name: 'Romanian Deadlift', category: 'legs', equipment: 'barbell', muscles: ['hamstrings', 'glutes'], instructions: 'Hinge at hips with slight knee bend, lower bar along legs.' },
  { id: 'ex_calf_raise', name: 'Calf Raise', category: 'legs', equipment: 'machine', muscles: ['calves'], instructions: 'Rise onto toes, hold at top, lower slowly.' },
  // Core
  { id: 'ex_plank', name: 'Plank', category: 'core', equipment: 'bodyweight', muscles: ['core'], instructions: 'Hold forearm plank position with body straight. Engage core throughout.' },
  { id: 'ex_crunches', name: 'Crunches', category: 'core', equipment: 'bodyweight', muscles: ['abs'], instructions: 'Lie on back, curl shoulders toward hips, control the descent.' },
  { id: 'ex_hanging_leg_raise', name: 'Hanging Leg Raise', category: 'core', equipment: 'bodyweight', muscles: ['abs', 'hip flexors'], instructions: 'Hang from bar, raise legs to parallel or higher.' },
  // Cardio
  { id: 'ex_running', name: 'Running', category: 'cardio', equipment: 'none', muscles: ['legs', 'cardiovascular'], instructions: 'Steady-state or interval running.' },
  { id: 'ex_cycling', name: 'Cycling', category: 'cardio', equipment: 'bike', muscles: ['legs', 'cardiovascular'], instructions: 'Stationary or outdoor cycling at moderate to high intensity.' },
  { id: 'ex_jump_rope', name: 'Jump Rope', category: 'cardio', equipment: 'jump rope', muscles: ['calves', 'cardiovascular'], instructions: 'Jump continuously with consistent rhythm.' },
];

// Default food database (sample — clearly labelled)
export const defaultFoods = [
  { id: 'food_chicken_breast', name: 'Chicken Breast (cooked)', category: 'protein', servingSize: '100g', calories: 165, protein: 31, carbs: 0, fat: 3.6, isSample: true },
  { id: 'food_eggs', name: 'Whole Eggs', category: 'protein', servingSize: '1 large (50g)', calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8, isSample: true },
  { id: 'food_salmon', name: 'Atlantic Salmon (cooked)', category: 'protein', servingSize: '100g', calories: 208, protein: 20, carbs: 0, fat: 13, isSample: true },
  { id: 'food_greek_yogurt', name: 'Greek Yogurt (plain)', category: 'dairy', servingSize: '170g', calories: 100, protein: 17, carbs: 6, fat: 0.7, isSample: true },
  { id: 'food_brown_rice', name: 'Brown Rice (cooked)', category: 'grain', servingSize: '1 cup (195g)', calories: 216, protein: 5, carbs: 45, fat: 1.8, isSample: true },
  { id: 'food_oatmeal', name: 'Oatmeal (cooked)', category: 'grain', servingSize: '1 cup (234g)', calories: 154, protein: 5.4, carbs: 27, fat: 2.6, isSample: true },
  { id: 'food_banana', name: 'Banana', category: 'fruit', servingSize: '1 medium (118g)', calories: 105, protein: 1.3, carbs: 27, fat: 0.4, isSample: true },
  { id: 'food_apple', name: 'Apple', category: 'fruit', servingSize: '1 medium (182g)', calories: 95, protein: 0.5, carbs: 25, fat: 0.3, isSample: true },
  { id: 'food_broccoli', name: 'Broccoli (cooked)', category: 'vegetable', servingSize: '1 cup (156g)', calories: 55, protein: 3.7, carbs: 11, fat: 0.6, isSample: true },
  { id: 'food_sweet_potato', name: 'Sweet Potato (baked)', category: 'vegetable', servingSize: '1 medium (114g)', calories: 103, protein: 2.3, carbs: 24, fat: 0.1, isSample: true },
  { id: 'food_almonds', name: 'Almonds', category: 'nuts', servingSize: '1 oz (28g)', calories: 164, protein: 6, carbs: 6, fat: 14, isSample: true },
  { id: 'food_peanut_butter', name: 'Peanut Butter', category: 'nuts', servingSize: '2 tbsp (32g)', calories: 188, protein: 8, carbs: 6, fat: 16, isSample: true },
  { id: 'food_whole_wheat_bread', name: 'Whole Wheat Bread', category: 'grain', servingSize: '1 slice (28g)', calories: 69, protein: 3.6, carbs: 12, fat: 1, isSample: true },
  { id: 'food_milk', name: 'Whole Milk', category: 'dairy', servingSize: '1 cup (244ml)', calories: 149, protein: 8, carbs: 12, fat: 8, isSample: true },
  { id: 'food_olive_oil', name: 'Olive Oil', category: 'oil', servingSize: '1 tbsp (14ml)', calories: 119, protein: 0, carbs: 0, fat: 14, isSample: true },
  { id: 'food_whey_protein', name: 'Whey Protein Shake', category: 'supplement', servingSize: '1 scoop (30g)', calories: 120, protein: 24, carbs: 3, fat: 1.5, isSample: true },
];

// Habit templates by category
export const habitTemplates = {
  discipline: [
    { name: 'Wake Up Early', description: 'Wake up before 6:00 AM', icon: '⏰', category: 'discipline' },
    { name: 'No Social Media', description: 'Avoid social media for the day', icon: '📵', category: 'discipline' },
    { name: 'Cold Shower', description: 'Take a cold shower', icon: '🚿', category: 'discipline' },
    { name: 'Make Your Bed', description: 'Make your bed first thing', icon: '🛏️', category: 'discipline' },
    { name: 'No Junk Food', description: 'Avoid processed and junk food', icon: '🚫', category: 'discipline' },
  ],
  body: [
    { name: 'Workout', description: 'Complete a workout session', icon: '💪', category: 'body' },
    { name: '10K Steps', description: 'Walk at least 10,000 steps', icon: '🚶', category: 'body' },
    { name: 'Stretch', description: '10 minutes of stretching', icon: '🧘', category: 'body' },
    { name: 'Drink Water', description: 'Drink 8 glasses of water', icon: '💧', category: 'body' },
  ],
  mind: [
    { name: 'Meditate', description: '10 minutes of meditation', icon: '🧠', category: 'mind' },
    { name: 'Journal', description: 'Write in your journal', icon: '📝', category: 'mind' },
    { name: 'Gratitude', description: 'Write 3 things you are grateful for', icon: '🙏', category: 'mind' },
    { name: 'No Complaining', description: 'Go the entire day without complaining', icon: '😊', category: 'mind' },
  ],
  learning: [
    { name: 'Read', description: 'Read for 30 minutes', icon: '📖', category: 'learning' },
    { name: 'Online Course', description: 'Complete a lesson or module', icon: '🎓', category: 'learning' },
    { name: 'Practice Skill', description: 'Practice a specific skill for 30 min', icon: '⚡', category: 'learning' },
  ],
  nutrition: [
    { name: 'Log Meals', description: 'Log all meals for the day', icon: '🍽️', category: 'nutrition' },
    { name: 'Eat Vegetables', description: 'Eat at least 3 servings of vegetables', icon: '🥦', category: 'nutrition' },
    { name: 'Meal Prep', description: 'Prepare meals for the next day', icon: '🧑‍🍳', category: 'nutrition' },
  ],
  money: [
    { name: 'Track Spending', description: 'Log all expenses for the day', icon: '💰', category: 'money' },
    { name: 'No Unnecessary Purchases', description: 'Avoid impulse buying', icon: '🛒', category: 'money' },
    { name: 'Save Money', description: 'Transfer to savings account', icon: '🏦', category: 'money' },
  ],
};

// Workout templates
export const defaultWorkoutTemplates = [
  {
    id: 'wt_push',
    name: 'Push Day',
    description: 'Chest, shoulders, and triceps',
    exercises: [
      { exerciseId: 'ex_bench_press', sets: 4, reps: 8 },
      { exerciseId: 'ex_incline_bench', sets: 3, reps: 10 },
      { exerciseId: 'ex_ohp', sets: 3, reps: 8 },
      { exerciseId: 'ex_lateral_raise', sets: 3, reps: 12 },
      { exerciseId: 'ex_tricep_pushdown', sets: 3, reps: 12 },
    ],
  },
  {
    id: 'wt_pull',
    name: 'Pull Day',
    description: 'Back and biceps',
    exercises: [
      { exerciseId: 'ex_deadlift', sets: 3, reps: 5 },
      { exerciseId: 'ex_pullups', sets: 4, reps: 8 },
      { exerciseId: 'ex_barbell_row', sets: 3, reps: 8 },
      { exerciseId: 'ex_face_pull', sets: 3, reps: 15 },
      { exerciseId: 'ex_barbell_curl', sets: 3, reps: 10 },
    ],
  },
  {
    id: 'wt_legs',
    name: 'Leg Day',
    description: 'Quads, hamstrings, and glutes',
    exercises: [
      { exerciseId: 'ex_squat', sets: 4, reps: 6 },
      { exerciseId: 'ex_leg_press', sets: 3, reps: 10 },
      { exerciseId: 'ex_rdl', sets: 3, reps: 10 },
      { exerciseId: 'ex_lunges', sets: 3, reps: 12 },
      { exerciseId: 'ex_calf_raise', sets: 4, reps: 15 },
    ],
  },
  {
    id: 'wt_full_body',
    name: 'Full Body',
    description: 'Complete workout hitting all major muscle groups',
    exercises: [
      { exerciseId: 'ex_squat', sets: 3, reps: 8 },
      { exerciseId: 'ex_bench_press', sets: 3, reps: 8 },
      { exerciseId: 'ex_barbell_row', sets: 3, reps: 8 },
      { exerciseId: 'ex_ohp', sets: 3, reps: 8 },
      { exerciseId: 'ex_plank', sets: 3, reps: 60 },
    ],
  },
];
