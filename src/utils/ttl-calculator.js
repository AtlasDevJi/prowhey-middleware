/**
 * Calculate seconds until next Friday at specified hour
 * @param {number} hour - Target hour (0-23), default 23 (11 PM)
 * @returns {number} Seconds until next Friday at specified hour
 */
function calculateTTLToNextFriday(hour = 23) {
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 5 = Friday
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentSecond = now.getSeconds();

  // Calculate seconds until next Friday at specified hour
  let daysUntilFriday = 0;
  let hoursUntilTarget = 0;
  let minutesUntilTarget = 0;
  let secondsUntilTarget = 0;

  if (currentDay === 5) {
    // Today is Friday
    if (currentHour < hour) {
      // Before target hour on Friday - TTL = hours until target hour today
      hoursUntilTarget = hour - currentHour;
      minutesUntilTarget = -currentMinute;
      secondsUntilTarget = -currentSecond;
    } else if (currentHour === hour && currentMinute === 0 && currentSecond === 0) {
      // Exactly at target time - TTL = 7 days (next Friday)
      daysUntilFriday = 7;
    } else {
      // After target hour on Friday - TTL = 7 days minus time since target hour
      daysUntilFriday = 7;
      hoursUntilTarget = hour - currentHour;
      minutesUntilTarget = -currentMinute;
      secondsUntilTarget = -currentSecond;
    }
  } else {
    // Not Friday - calculate days until next Friday
    if (currentDay < 5) {
      // Before Friday this week
      daysUntilFriday = 5 - currentDay;
    } else {
      // After Friday (Saturday or Sunday)
      daysUntilFriday = 7 - currentDay + 5; // Days until next Friday
    }

    // Calculate hours until target hour on Friday
    hoursUntilTarget = hour - currentHour;
    minutesUntilTarget = -currentMinute;
    secondsUntilTarget = -currentSecond;
  }

  // Convert to total seconds
  const totalSeconds =
    daysUntilFriday * 24 * 60 * 60 +
    hoursUntilTarget * 60 * 60 +
    minutesUntilTarget * 60 +
    secondsUntilTarget;

  // Ensure positive value (should always be positive, but safety check)
  return Math.max(0, totalSeconds);
}

module.exports = {
  calculateTTLToNextFriday,
};
