import { useState, useEffect } from 'react';
import { UserMigrationService } from '../services/UserMigrationService';
import { MigrationService } from '../services/MigrationService';

interface MigrationStats {
  totalUsers: number;
  migratedUsers: number;
  pendingMigration: number;
  migrationRate: number;
}

interface BatchMigrationProgress {
  completed: number;
  total: number;
  currentUser: string;
}

/**
 * MigrationMonitor component for admin dashboard
 * Displays migration statistics and allows manual batch migration
 */
export function MigrationMonitor() {
  const [stats, setStats] = useState<MigrationStats>({
    totalUsers: 0,
    migratedUsers: 0,
    pendingMigration: 0,
    migrationRate: 0
  });
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [progress, setProgress] = useState<BatchMigrationProgress | null>(null);
  const [migrationResults, setMigrationResults] = useState<{
    successful: number;
    failed: number;
    errors: Array<{ userId: string; error: string }>;
  } | null>(null);

  // Load migration statistics
  const loadStats = async () => {
    try {
      setLoading(true);
      const migrationStats = await UserMigrationService.getMigrationStats();
      setStats(migrationStats);
    } catch (error) {
      console.error('Failed to load migration stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load stats on component mount
  useEffect(() => {
    loadStats();
  }, []);

  // Handle manual batch migration
  const handleBatchMigration = async () => {
    if (migrating || stats.pendingMigration === 0) return;

    try {
      setMigrating(true);
      setProgress({ completed: 0, total: stats.pendingMigration, currentUser: '' });
      setMigrationResults(null);

      // Start batch migration
      const results = await MigrationService.migrateAllUsers((progressData) => {
        setProgress({
          completed: progressData.migrated,
          total: progressData.total,
          currentUser: progressData.current
        });
      });

      // Convert migration service results to component format
      setMigrationResults({
        successful: results.migrated,
        failed: results.errors.length,
        errors: results.errors.map(error => ({
          userId: 'Unknown',
          error: error
        }))
      });
      
      // Reload stats after migration
      await loadStats();
    } catch (error) {
      console.error('Batch migration failed:', error);
    } finally {
      setMigrating(false);
      setProgress(null);
    }
  };

  const progressPercentage = stats.totalUsers > 0 
    ? Math.round((stats.migratedUsers / stats.totalUsers) * 100) 
    : 0;

  const batchProgressPercentage = progress 
    ? Math.round((progress.completed / progress.total) * 100) 
    : 0;

  if (loading) {
    return (
      <div className="migration-monitor loading">
        <div className="loading-spinner"></div>
        <p>Loading migration statistics...</p>
      </div>
    );
  }

  return (
    <div className="migration-monitor">
      <div className="migration-header">
        <h2>Payment System Migration Monitor</h2>
        <button 
          onClick={loadStats} 
          className="refresh-btn"
          disabled={loading || migrating}
        >
          🔄 Refresh Stats
        </button>
      </div>

      {/* Migration Statistics */}
      <div className="migration-stats">
        <div className="stat-card">
          <h3>Total Users</h3>
          <div className="stat-value">{stats.totalUsers.toLocaleString()}</div>
        </div>
        
        <div className="stat-card">
          <h3>Migrated Users</h3>
          <div className="stat-value">{stats.migratedUsers.toLocaleString()}</div>
        </div>
        
        <div className="stat-card">
          <h3>Pending Migration</h3>
          <div className="stat-value pending">{stats.pendingMigration.toLocaleString()}</div>
        </div>
        
        <div className="stat-card">
          <h3>Migration Rate</h3>
          <div className="stat-value">{progressPercentage}%</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="migration-progress">
        <div className="progress-header">
          <h3>Migration Progress</h3>
          <span className="progress-text">{progressPercentage}% Complete</span>
        </div>
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${progressPercentage}%` }}
          ></div>
        </div>
      </div>

      {/* Batch Migration Controls */}
      {stats.pendingMigration > 0 && (
        <div className="batch-migration">
          <div className="batch-header">
            <h3>Batch Migration</h3>
            <p>{stats.pendingMigration} users need migration to the new payment system</p>
          </div>
          
          <button 
            onClick={handleBatchMigration}
            disabled={migrating || stats.pendingMigration === 0}
            className="migration-btn"
          >
            {migrating ? 'Migrating...' : `Migrate ${stats.pendingMigration} Users`}
          </button>
          
          {progress && (
            <div className="batch-progress">
              <div className="batch-progress-header">
                <span>Migrating users... {batchProgressPercentage}%</span>
                <span>{progress.completed} / {progress.total}</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${batchProgressPercentage}%` }}
                ></div>
              </div>
              {progress.currentUser && (
                <p className="current-user">Current: {progress.currentUser}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Migration Results */}
      {migrationResults && (
        <div className="migration-results">
          <h3>Migration Results</h3>
          <div className="results-summary">
            <div className="result-item success">
              <span className="result-label">Successful:</span>
              <span className="result-value">{migrationResults.successful}</span>
            </div>
            <div className="result-item failed">
              <span className="result-label">Failed:</span>
              <span className="result-value">{migrationResults.failed}</span>
            </div>
          </div>
          
          {migrationResults.errors.length > 0 && (
            <div className="migration-errors">
              <h4>Migration Errors</h4>
              <div className="error-list">
                {migrationResults.errors.slice(0, 10).map((error, index) => (
                  <div key={index} className="error-item">
                    <span className="error-user">User: {error.userId}</span>
                    <span className="error-message">{error.error}</span>
                  </div>
                ))}
                {migrationResults.errors.length > 10 && (
                  <p className="error-more">
                    ... and {migrationResults.errors.length - 10} more errors
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Success Message */}
      {stats.pendingMigration === 0 && stats.totalUsers > 0 && (
        <div className="migration-complete">
          <div className="success-icon">✅</div>
          <h3>Migration Complete!</h3>
          <p>All {stats.totalUsers} users have been successfully migrated to the new payment system.</p>
        </div>
      )}
    </div>
  );
}

// CSS styles (you can move this to a separate CSS file)
const migrationStyles = `
.migration-monitor {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.migration-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.migration-header h2 {
  margin: 0;
  color: #333;
}

.refresh-btn {
  padding: 8px 16px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.refresh-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.migration-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.stat-card {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  text-align: center;
}

.stat-card h3 {
  margin: 0 0 10px 0;
  color: #666;
  font-size: 14px;
  text-transform: uppercase;
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #333;
}

.stat-value.pending {
  color: #ff6b35;
}

.migration-progress {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  margin-bottom: 30px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.progress-bar {
  width: 100%;
  height: 20px;
  background: #e9ecef;
  border-radius: 10px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #28a745, #20c997);
  transition: width 0.3s ease;
}

.batch-migration {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  margin-bottom: 30px;
}

.migration-btn {
  padding: 12px 24px;
  background: #28a745;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
  margin-top: 15px;
}

.migration-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.batch-progress {
  margin-top: 20px;
}

.batch-progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.current-user {
  margin-top: 10px;
  font-size: 14px;
  color: #666;
}

.migration-results {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  margin-bottom: 30px;
}

.results-summary {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.result-item.success .result-value {
  color: #28a745;
  font-weight: bold;
}

.result-item.failed .result-value {
  color: #dc3545;
  font-weight: bold;
}

.migration-errors {
  border-top: 1px solid #eee;
  padding-top: 20px;
}

.error-list {
  max-height: 300px;
  overflow-y: auto;
}

.error-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;
}

.error-user {
  font-weight: bold;
  color: #333;
}

.error-message {
  color: #dc3545;
  font-size: 14px;
}

.migration-complete {
  background: #d4edda;
  border: 1px solid #c3e6cb;
  color: #155724;
  padding: 30px;
  border-radius: 8px;
  text-align: center;
}

.success-icon {
  font-size: 48px;
  margin-bottom: 15px;
}

.loading {
  text-align: center;
  padding: 40px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
`;

// Inject styles (in a real app, you'd put this in a CSS file)
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = migrationStyles;
  document.head.appendChild(styleSheet);
} 