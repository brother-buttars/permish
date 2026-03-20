const rateLimit = require('express-rate-limit');

const skip = () => process.env.NODE_ENV === 'test';

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many registration attempts, try again later' },
  skip,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, try again later' },
  skip,
});

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many submissions, try again later' },
  skip,
});

const formLoadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests, try again later' },
  skip,
});

module.exports = { registerLimiter, loginLimiter, submitLimiter, formLoadLimiter };
