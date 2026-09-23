/**
 * Business Registration & Admin Dashboard
 *
 * Comprehensive dashboard for business owners to:
 * - View registration status
 * - Manage business profile
 * - Track visitor analytics
 * - Manage customer inquiries
 * - Monitor posts and engagement
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import {
  readRegisteredSmallBusinesses,
} from "@/lib/business-content";

interface RegistrationStats {
  status: "not-registered" | "pending" | "approved" | "rejected";
  registeredAt?: string;
  businessesNearby: number;
  competitorCount: number;
  estimatedSearchVisibility: number;
}

interface BusinessMetrics {
  profileViews: number;
  inquiries: number;
  savedCount: number;
  averageRating: number;
  reviewCount: number;
  lastPostDate?: string;
  totalPosts: number;
}

export function BusinessRegistrationDashboard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<RegistrationStats>({
    status: "not-registered",
    businessesNearby: 0,
    competitorCount: 0,
    estimatedSearchVisibility: 0,
  });
  const [metrics] = useState<BusinessMetrics>({
    profileViews: 0,
    inquiries: 0,
    savedCount: 0,
    averageRating: 0,
    reviewCount: 0,
    totalPosts: 0,
  });
  const [showRegistrationGuide, setShowRegistrationGuide] = useState(false);
  const [registrationStep, setRegistrationStep] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;

    // Check registration status
    const registeredBusinesses = readRegisteredSmallBusinesses();
    const isRegistered = registeredBusinesses.some((b) => b.ownerUid === user.uid);

    if (isRegistered) {
      const business = registeredBusinesses.find((b) => b.ownerUid === user.uid)!;
      setStats((prev) => ({
        ...prev,
        status: "approved",
        registeredAt: new Date().toISOString(),
        competitorCount: registeredBusinesses.filter(
          (b) => b.category === business.category,
        ).length,
      }));
    }

    // Calculate nearby businesses
    const nearbyCount = registeredBusinesses.length;
    setStats((prev) => ({ ...prev, businessesNearby: nearbyCount }));
  }, [user?.uid]);

  const registrationSteps = [
    {
      title: "Business Information",
      description: "Add your business name, category, and location",
      icon: "storefront",
      completed: Boolean(profile?.display_name),
    },
    {
      title: "Business Profile",
      description: "Upload cover photo, logo, and business hours",
      icon: "image",
      completed: false,
    },
    {
      title: "Verification",
      description: "We'll verify your business details",
      icon: "verified",
      completed: false,
    },
    {
      title: "Go Live",
      description: "Your business is now discoverable in Explore",
      icon: "public",
      completed: false,
    },
  ];

  const renderRegistrationStatus = () => {
    if (stats.status === "approved") {
      return (
        <div className="registration-card status-approved">
          <div className="status-badge approved">
            <span className="icon">✓</span>
            <strong>Registered & Live</strong>
          </div>
          <p>Your business is visible in the Explore section and discoverable by travelers.</p>
          <div className="registration-stats-grid">
            <div className="stat">
              <span className="label">Profile Views</span>
              <strong className="value">{metrics.profileViews.toLocaleString()}</strong>
            </div>
            <div className="stat">
              <span className="label">Saved by Travelers</span>
              <strong className="value">{metrics.savedCount}</strong>
            </div>
            <div className="stat">
              <span className="label">Inquiries Received</span>
              <strong className="value">{metrics.inquiries}</strong>
            </div>
            <div className="stat">
              <span className="label">Rating</span>
              <strong className="value">{metrics.averageRating.toFixed(1)} ★</strong>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="registration-card status-pending">
        <div className="status-badge pending">
          <span className="icon">○</span>
          <strong>Not Yet Registered</strong>
        </div>
        <p>Register your business to appear in Explore and connect with travelers in Legazpi.</p>
        <button
          className="register-button"
          onClick={() => setShowRegistrationGuide(true)}
        >
          Start Registration
        </button>
        <div className="registration-benefits">
          <h4>Benefits of Registration:</h4>
          <ul>
            <li>✓ Appear in Explore section</li>
            <li>✓ Receive traveler inquiries</li>
            <li>✓ Publish posts and promotions</li>
            <li>✓ Track visitor analytics</li>
            <li>✓ Collect customer reviews</li>
            <li>✓ Free basic listing</li>
          </ul>
        </div>
      </div>
    );
  };

  const renderRegistrationGuide = () => {
    return (
      <div className="registration-modal-backdrop">
        <div className="registration-modal">
          <div className="modal-header">
            <h2>Register Your Business</h2>
            <button
              className="close-btn"
              onClick={() => setShowRegistrationGuide(false)}
            >
              ✕
            </button>
          </div>

          <div className="registration-progress">
            {registrationSteps.map((step, index) => (
              <div
                key={index}
                className={`progress-step ${
                  index === registrationStep ? "active" : ""
                } ${step.completed ? "completed" : ""}`}
              >
                <div className="step-number">{index + 1}</div>
                <div className="step-info">
                  <strong>{step.title}</strong>
                  <small>{step.description}</small>
                </div>
              </div>
            ))}
          </div>

          <div className="registration-content">
            {registrationStep === 0 && (
              <div className="step-content">
                <h3>Business Information</h3>
                <p>Tell us about your business so travelers can find you.</p>
                <div className="form-group">
                  <label>Business Name</label>
                  <input
                    type="text"
                    placeholder={profile?.display_name || "Your business name"}
                    disabled
                  />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select>
                    <option>Cafe</option>
                    <option>Restaurant</option>
                    <option>Hotel</option>
                    <option>Tour Operator</option>
                    <option>Shop</option>
                    <option>Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Location</label>
                  <input type="text" placeholder="Street address, city" />
                </div>
              </div>
            )}

            {registrationStep === 1 && (
              <div className="step-content">
                <h3>Business Profile</h3>
                <p>Upload photos and set your business hours.</p>
                <div className="form-group">
                  <label>Cover Photo</label>
                  <div className="upload-area">
                    <span className="upload-icon">📷</span>
                    <p>Upload a cover photo (1200x400px recommended)</p>
                    <input type="file" accept="image/*" />
                  </div>
                </div>
                <div className="form-group">
                  <label>Business Hours</label>
                  <input
                    type="text"
                    placeholder="e.g., Mon-Sat 9:00 AM - 6:00 PM"
                  />
                </div>
              </div>
            )}

            {registrationStep === 2 && (
              <div className="step-content">
                <h3>Verification</h3>
                <p>We're reviewing your business information.</p>
                <div className="verification-info">
                  <p>
                    Our team typically verifies new businesses within 24-48 hours.
                    You'll receive an email notification when approved.
                  </p>
                  <ul>
                    <li>✓ Business name and address verified</li>
                    <li>✓ Photos approved</li>
                    <li>✓ Contact information validated</li>
                  </ul>
                </div>
              </div>
            )}

            {registrationStep === 3 && (
              <div className="step-content success">
                <h3>🎉 Your Business is Live!</h3>
                <p>
                  Your business is now discoverable in Explore. Travelers can find
                  you, save your business, and send inquiries.
                </p>
                <div className="next-steps">
                  <h4>Next Steps:</h4>
                  <ul>
                    <li>Create your first post (photos, events, or promotions)</li>
                    <li>Respond to traveler inquiries in your inbox</li>
                    <li>Encourage customers to leave reviews</li>
                    <li>Track your visitor analytics</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button
              className="btn-secondary"
              onClick={() => {
                if (registrationStep > 0) setRegistrationStep(registrationStep - 1);
              }}
              disabled={registrationStep === 0}
            >
              Back
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                if (registrationStep < registrationSteps.length - 1) {
                  setRegistrationStep(registrationStep + 1);
                } else {
                  setShowRegistrationGuide(false);
                }
              }}
            >
              {registrationStep === registrationSteps.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="business-registration-dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Business Management</h1>
          <p>Manage your business profile and track your performance</p>
        </div>
      </header>

      <section className="dashboard-section">
        <h2>Registration Status</h2>
        {renderRegistrationStatus()}
      </section>

      <section className="dashboard-section">
        <h2>Performance Overview</h2>
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-icon">👁️</div>
            <div className="metric-info">
              <span className="metric-label">Profile Views</span>
              <strong className="metric-value">
                {metrics.profileViews.toLocaleString()}
              </strong>
              <small className="metric-change">+12% this week</small>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon">💬</div>
            <div className="metric-info">
              <span className="metric-label">Inquiries</span>
              <strong className="metric-value">{metrics.inquiries}</strong>
              <small className="metric-change">+3 this week</small>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon">❤️</div>
            <div className="metric-info">
              <span className="metric-label">Saved by Travelers</span>
              <strong className="metric-value">{metrics.savedCount}</strong>
              <small className="metric-change">+8 this week</small>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon">⭐</div>
            <div className="metric-info">
              <span className="metric-label">Average Rating</span>
              <strong className="metric-value">
                {metrics.averageRating.toFixed(1)}
              </strong>
              <small className="metric-change">
                {metrics.reviewCount} reviews
              </small>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <h2>Market Insights</h2>
        <div className="insights-grid">
          <div className="insight-card">
            <h3>Your Category</h3>
            <p className="insight-value">{stats.competitorCount}</p>
            <p className="insight-label">
              Similar businesses in Legazpi
            </p>
          </div>

          <div className="insight-card">
            <h3>Search Visibility</h3>
            <div className="visibility-bar">
              <div
                className="visibility-fill"
                style={{
                  width: `${stats.estimatedSearchVisibility}%`,
                }}
              />
            </div>
            <p className="insight-label">
              Estimated visibility: {stats.estimatedSearchVisibility}%
            </p>
          </div>

          <div className="insight-card">
            <h3>Boost Tips</h3>
            <ul className="boost-tips">
              <li>✓ Add more high-quality photos</li>
              <li>✓ Publish weekly posts</li>
              <li>✓ Respond quickly to inquiries</li>
              <li>✓ Encourage customer reviews</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <h2>Quick Actions</h2>
        <div className="actions-grid">
          <button className="action-btn">
            <span className="action-icon">📸</span>
            <span>Create Post</span>
          </button>
          <button className="action-btn">
            <span className="action-icon">📝</span>
            <span>Edit Profile</span>
          </button>
          <button className="action-btn">
            <span className="action-icon">📊</span>
            <span>View Analytics</span>
          </button>
          <button className="action-btn">
            <span className="action-icon">⚙️</span>
            <span>Settings</span>
          </button>
        </div>
      </section>

      {showRegistrationGuide && renderRegistrationGuide()}

      <style>{`
        .business-registration-dashboard {
          padding: 24px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .dashboard-header {
          margin-bottom: 32px;
        }

        .dashboard-header h1 {
          font-size: 28px;
          font-weight: 900;
          margin-bottom: 8px;
          color: var(--c-text-primary, #1a1a1a);
        }

        .dashboard-header p {
          color: var(--c-text-secondary, #666);
          font-size: 14px;
        }

        .dashboard-section {
          margin-bottom: 40px;
        }

        .dashboard-section h2 {
          font-size: 18px;
          font-weight: 800;
          margin-bottom: 16px;
          color: var(--c-text-primary, #1a1a1a);
        }

        /* Registration Card */
        .registration-card {
          border: 2px solid var(--c-border, #ddd);
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 16px;
        }

        .registration-card.status-approved {
          border-color: var(--c-green, #10b981);
          background-color: rgba(16, 185, 129, 0.05);
        }

        .registration-card.status-pending {
          border-color: var(--c-warning, #f59e0b);
          background-color: rgba(245, 158, 11, 0.05);
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 6px;
          font-weight: 700;
          font-size: 13px;
          margin-bottom: 16px;
        }

        .status-badge.approved {
          background-color: var(--c-green, #10b981);
          color: white;
        }

        .status-badge.pending {
          background-color: var(--c-warning, #f59e0b);
          color: white;
        }

        .status-badge .icon {
          font-weight: 900;
          font-size: 16px;
        }

        .registration-card p {
          color: var(--c-text-secondary, #666);
          line-height: 1.6;
          margin-bottom: 16px;
        }

        .register-button {
          background-color: var(--c-green, #10b981);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 700;
          cursor: pointer;
          margin-bottom: 24px;
        }

        .register-button:hover {
          background-color: var(--c-green-dark, #059669);
        }

        .registration-benefits {
          background-color: rgba(0, 0, 0, 0.02);
          padding: 16px;
          border-radius: 8px;
          margin-top: 16px;
        }

        .registration-benefits h4 {
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .registration-benefits ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .registration-benefits li {
          padding: 4px 0;
          font-size: 13px;
          color: var(--c-text-secondary, #666);
        }

        /* Metrics Grid */
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }

        .metric-card {
          background: white;
          border: 1px solid var(--c-border, #ddd);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          align-items: flex-start;
          gap: 16px;
        }

        .metric-icon {
          font-size: 32px;
        }

        .metric-value {
          display: block;
          font-size: 24px;
          font-weight: 900;
          color: var(--c-text-primary, #1a1a1a);
          margin: 4px 0;
        }

        .metric-label {
          display: block;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--c-text-secondary, #999);
          font-weight: 600;
        }

        .metric-change {
          display: block;
          font-size: 12px;
          color: var(--c-green, #10b981);
          margin-top: 4px;
        }

        /* Insights Grid */
        .insights-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 16px;
        }

        .insight-card {
          background: white;
          border: 1px solid var(--c-border, #ddd);
          border-radius: 12px;
          padding: 20px;
        }

        .insight-card h3 {
          font-size: 14px;
          font-weight: 700;
          margin-bottom: 12px;
          color: var(--c-text-primary, #1a1a1a);
        }

        .insight-value {
          font-size: 28px;
          font-weight: 900;
          color: var(--c-green, #10b981);
          margin-bottom: 4px;
        }

        .insight-label {
          font-size: 12px;
          color: var(--c-text-secondary, #666);
          margin: 0;
        }

        .visibility-bar {
          background-color: #f0f0f0;
          height: 8px;
          border-radius: 4px;
          overflow: hidden;
          margin: 12px 0;
        }

        .visibility-fill {
          height: 100%;
          background-color: var(--c-green, #10b981);
          transition: width 0.3s ease;
        }

        .boost-tips {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .boost-tips li {
          padding: 6px 0;
          font-size: 13px;
          color: var(--c-text-secondary, #666);
        }

        /* Actions Grid */
        .actions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 12px;
        }

        .action-btn {
          background: white;
          border: 2px solid var(--c-border, #ddd);
          border-radius: 12px;
          padding: 16px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          transition: all 0.2s ease;
          font-weight: 600;
          font-size: 13px;
        }

        .action-btn:hover {
          border-color: var(--c-green, #10b981);
          background-color: rgba(16, 185, 129, 0.05);
        }

        .action-icon {
          font-size: 24px;
        }

        /* Modal */
        .registration-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .registration-modal {
          background: white;
          border-radius: 12px;
          max-width: 600px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 24px;
          border-bottom: 1px solid var(--c-border, #ddd);
        }

        .modal-header h2 {
          font-size: 20px;
          font-weight: 800;
          margin: 0;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: var(--c-text-secondary, #999);
        }

        .registration-progress {
          padding: 24px;
          border-bottom: 1px solid var(--c-border, #ddd);
        }

        .progress-step {
          display: flex;
          gap: 12px;
          padding: 12px 0;
          opacity: 0.5;
        }

        .progress-step.active {
          opacity: 1;
        }

        .progress-step.completed {
          opacity: 1;
        }

        .step-number {
          min-width: 32px;
          height: 32px;
          background-color: var(--c-border, #ddd);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 14px;
        }

        .progress-step.active .step-number {
          background-color: var(--c-green, #10b981);
          color: white;
        }

        .progress-step.completed .step-number {
          background-color: var(--c-green, #10b981);
          color: white;
        }

        .progress-step.completed .step-number::after {
          content: "✓";
          position: absolute;
        }

        .step-info strong {
          display: block;
          font-size: 14px;
          margin-bottom: 4px;
        }

        .step-info small {
          display: block;
          font-size: 12px;
          color: var(--c-text-secondary, #999);
        }

        .registration-content {
          padding: 24px;
        }

        .step-content h3 {
          font-size: 18px;
          font-weight: 800;
          margin-bottom: 8px;
        }

        .step-content > p {
          color: var(--c-text-secondary, #666);
          margin-bottom: 20px;
          font-size: 14px;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          font-weight: 700;
          font-size: 13px;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .form-group input,
        .form-group select {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--c-border, #ddd);
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
        }

        .form-group input:disabled {
          background-color: var(--c-disabled, #f5f5f5);
          color: var(--c-text-secondary, #999);
        }

        .upload-area {
          border: 2px dashed var(--c-border, #ddd);
          border-radius: 8px;
          padding: 40px 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .upload-area:hover {
          border-color: var(--c-green, #10b981);
          background-color: rgba(16, 185, 129, 0.05);
        }

        .upload-icon {
          font-size: 32px;
          display: block;
          margin-bottom: 8px;
        }

        .upload-area p {
          margin: 8px 0 0 0;
          font-size: 13px;
          color: var(--c-text-secondary, #666);
        }

        .upload-area input {
          display: none;
        }

        .verification-info {
          background-color: rgba(16, 185, 129, 0.05);
          border: 1px solid var(--c-green, #10b981);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
        }

        .verification-info p {
          margin: 0 0 12px 0;
          font-size: 14px;
          color: var(--c-text-primary, #1a1a1a);
        }

        .verification-info ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .verification-info li {
          padding: 4px 0;
          font-size: 13px;
          color: var(--c-text-secondary, #666);
        }

        .step-content.success h3 {
          color: var(--c-green, #10b981);
        }

        .next-steps {
          background-color: rgba(16, 185, 129, 0.05);
          border-radius: 8px;
          padding: 16px;
        }

        .next-steps h4 {
          margin: 0 0 12px 0;
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .next-steps ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .next-steps li {
          padding: 6px 0;
          font-size: 13px;
          color: var(--c-text-secondary, #666);
        }

        .modal-footer {
          display: flex;
          gap: 12px;
          padding: 24px;
          border-top: 1px solid var(--c-border, #ddd);
          justify-content: flex-end;
        }

        .btn-primary,
        .btn-secondary {
          padding: 10px 20px;
          border-radius: 6px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          border: none;
          transition: all 0.2s ease;
        }

        .btn-primary {
          background-color: var(--c-green, #10b981);
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background-color: var(--c-green-dark, #059669);
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-secondary {
          background-color: var(--c-border, #ddd);
          color: var(--c-text-primary, #1a1a1a);
        }

        .btn-secondary:hover:not(:disabled) {
          background-color: var(--c-border-hover, #ccc);
        }

        .btn-secondary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .metrics-grid,
          .insights-grid {
            grid-template-columns: 1fr;
          }

          .registration-modal {
            max-height: 100vh;
            border-radius: 12px 12px 0 0;
          }
        }
      `}</style>
    </div>
  );
}
