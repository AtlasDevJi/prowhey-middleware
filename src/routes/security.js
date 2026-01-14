const express = require('express');
const router = express.Router();

/**
 * GET /api/security/certificate-info
 * Returns certificate fingerprint for certificate pinning
 * This allows the mobile app to implement certificate pinning
 */
router.get('/certificate-info', (req, res) => {
  try {
    // Certificate fingerprint (from environment or default)
    const fingerprint = process.env.CERTIFICATE_FINGERPRINT || 
      '93:97:CF:CF:B2:38:96:B3:A3:DA:07:8B:81:D4:5E:B5:95:AF:E3:9F:2B:CE:A0:11:68:93:BC:59:B1:62:95:08';
    
    // Public key hash (base64)
    const publicKeyHash = process.env.CERTIFICATE_PUBLIC_KEY_HASH ||
      'aL5ltquGh2FECBSWB/U0nryjBNv43k4T83lw/IS9RHY=';
    
    return res.json({
      success: true,
      data: {
        fingerprint: fingerprint,
        fingerprintNoColons: fingerprint.replace(/:/g, ''),
        publicKeyHash: publicKeyHash,
        algorithm: 'SHA-256',
        server: '193.42.63.107',
        validUntil: '2027-01-03',
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve certificate information',
      message: error.message,
    });
  }
});

module.exports = router;

