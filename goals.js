import express from 'express';
import { Goal } from '../models/Goal.js';
import { Puff } from '../models/Puff.js';
import { Device } from '../models/Device.js';
import { authenticate } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { AppError } from '../middleware/errorHandler.js';
import { broadcastToUser } from '../services/websocket.js';

const router = express.Router();

// Get all goals
router.get('/', authenticate, async (req, res, next) => {
  try {
    const goals = await Goal.find({ userId: req.user._id })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: goals.length,
      goals: goals.map(g => ({
        id: g._id,
        type: g.type,
        title: g.title,
        description: g.description,
        startValue: g.startValue,
        currentValue: g.currentValue,
        targetValue: g.targetValue,
        unit: g.unit,
        progress: g.progress,
        daysActive: g.daysActive,
        amountChanged: g.amountChanged,
        isOnTrack: g.isOnTrack,
        status: g.status,
        startedAt: g.startedAt,
        deadline: g.deadline,
        completedAt: g.completedAt,
        steps: g.steps
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Create new goal
router.post('/', authenticate, validate(schemas.goalCreate), async (req, res, next) => {
  try {
    const { type, targetValue, startValue, deadline, title, description } = req.body;

    const typeConfig = {
      nicotine_reduction: {
        title: title || 'Nicotine Reduction Plan',
        unit: 'mg',
        description: description || 'Gradually reduce nicotine intake'
      },
      puff_limit: {
        title: title || 'Daily Puff Limit',
        unit: 'puffs',
        description: description || 'Limit daily puff count'
      },
      coil_life: {
        title: title || 'Extend Coil Life',
        unit: 'days',
        description: description || 'Maximize coil usage efficiency'
      },
      liquid_saving: {
        title: title || 'E-Liquid Saving',
        unit: 'ml',
        description: description || 'Reduce e-liquid consumption'
      },
      session_time: {
        title: title || 'Session Time Control',
        unit: 'minutes',
        description: description || 'Control vaping session duration'
      }
    };

    const config = typeConfig[type];
    if (!config) {
      throw new AppError('Invalid goal type', 400, 'INVALID_GOAL_TYPE');
    }

    // Generate steps
    const steps = generateSteps(startValue, targetValue, type);

    const goal = await Goal.create({
      userId: req.user._id,
      type,
      title: config.title,
      description: config.description,
      startValue,
      currentValue: startValue,
      targetValue,
      unit: config.unit,
      deadline: new Date(deadline),
      steps
    });

    broadcastToUser(req.user._id.toString(), 'goal:created', {
      goalId: goal._id,
      title: goal.title,
      type: goal.type
    });

    res.status(201).json({
      success: true,
      goal: {
        id: goal._id,
        type: goal.type,
        title: goal.title,
        startValue: goal.startValue,
        currentValue: goal.currentValue,
        targetValue: goal.targetValue,
        progress: goal.progress,
        steps: goal.steps,
        status: goal.status
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update goal progress
router.patch('/:goalId/progress', authenticate, async (req, res, next) => {
  try {
    const { currentValue } = req.body;

    const goal = await Goal.findOne({
      _id: req.params.goalId,
      userId: req.user._id
    });

    if (!goal) {
      throw new AppError('Goal not found', 404, 'GOAL_NOT_FOUND');
    }

    goal.currentValue = currentValue;

    // Update steps
    goal.steps = goal.steps.map(step => {
      const isCompleted = 
        (goal.startValue > goal.targetValue && currentValue <= step.value) ||
        (goal.startValue < goal.targetValue && currentValue >= step.value);

      return {
        ...step,
        completed: isCompleted,
        completedAt: isCompleted && !step.completed ? new Date() : step.completedAt
      };
    });

    await goal.save();

    broadcastToUser(req.user._id.toString(), 'goal:updated', {
      goalId: goal._id,
      progress: goal.progress,
      currentValue: goal.currentValue,
      isOnTrack: goal.isOnTrack
    });

    res.json({
      success: true,
      goal: {
        id: goal._id,
        progress: goal.progress,
        currentValue: goal.currentValue,
        isOnTrack: goal.isOnTrack,
        steps: goal.steps,
        status: goal.status
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get active nicotine reduction goal (for dashboard)
router.get('/nicotine-reduction/active', authenticate, async (req, res, next) => {
  try {
    const goal = await Goal.findOne({
      userId: req.user._id,
      type: 'nicotine_reduction',
      status: 'active'
    });

    if (!goal) {
      return res.json({
        success: true,
        hasGoal: false
      });
    }

    // Get current nicotine from today's puffs
    const todayStats = await Puff.getDailyStats(req.user._id);
    const currentNicotine = todayStats.totalNicotine;

    res.json({
      success: true,
      hasGoal: true,
      goal: {
        id: goal._id,
        title: goal.title,
        startValue: goal.startValue,
        currentValue: goal.currentValue,
        targetValue: goal.targetValue,
        progress: goal.progress,
        daysActive: goal.daysActive,
        amountChanged: goal.amountChanged,
        isOnTrack: goal.isOnTrack,
        steps: goal.steps,
        unit: goal.unit
      },
      todayNicotine: currentNicotine.toFixed(1)
    });
  } catch (error) {
    next(error);
  }
});

// Get puff limit status
router.get('/puff-limit/status', authenticate, async (req, res, next) => {
  try {
    const device = await Device.findOne({ userId: req.user._id });
    const limit = device?.settings?.puffLimit || 200;

    const todayStats = await Puff.getDailyStats(req.user._id);
    const used = todayStats.totalPuffs;
    const remaining = Math.max(0, limit - used);
    const percentage = Math.min(100, (used / limit) * 100);

    let status = 'good';
    let statusColor = 'var(--ok)';
    if (percentage > 90) {
      status = 'critical';
      statusColor = 'var(--danger)';
    } else if (percentage > 70) {
      status = 'warning';
      statusColor = 'var(--warn)';
    }

    res.json({
      success: true,
      limit: {
        total: limit,
        used,
        remaining,
        percentage: Math.round(percentage),
        status,
        statusColor,
        resetIn: getHoursUntilMidnight()
      }
    });
  } catch (error) {
    next(error);
  }
});

// Delete goal
router.delete('/:goalId', authenticate, async (req, res, next) => {
  try {
    const goal = await Goal.findOneAndDelete({
      _id: req.params.goalId,
      userId: req.user._id
    });

    if (!goal) {
      throw new AppError('Goal not found', 404, 'GOAL_NOT_FOUND');
    }

    res.json({ success: true, message: 'Goal deleted' });
  } catch (error) {
    next(error);
  }
});

function generateSteps(start, target, type) {
  const steps = [];
  const diff = Math.abs(start - target);
  const stepCount = 4;
  const stepSize = diff / stepCount;

  for (let i = 1; i <= stepCount; i++) {
    const value = start > target 
      ? start - (stepSize * i)
      : start + (stepSize * i);

    steps.push({
      value: Math.round(value * 10) / 10,
      label: `Step ${i}: ${Math.round(value * 10) / 10}mg`,
      completed: false
    });
  }

  return steps;
}

function getHoursUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.round((midnight - now) / (1000 * 60 * 60));
}

export default router;
