import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  where,
  serverTimestamp,
  updateDoc,
  increment,
  type Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import type { User } from 'firebase/auth';
import type { UsageAnalytics } from '../types/payment';
import { CreditTransactionService } from './CreditTransactionService';

// Service for managing usage analytics and reporting
export class AnalyticsService {
  
  // Get analytics collection reference for a user
  private static getAnalyticsCollection(userId: string) {
    return collection(db, 'users', userId, 'analytics');
  }

  // Get analytics document reference for a specific period
  private static getAnalyticsDoc(userId: string, period: string) {
    return doc(db, 'users', userId, 'analytics', period);
  }

  // Generate period string in YYYY-MM format
  private static getCurrentPeriod(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  }

  // Initialize analytics document for a period
  static async initializeAnalyticsPeriod(
    user: User, 
    period: string = this.getCurrentPeriod()
  ): Promise<void> {
    try {
      const analyticsDoc = this.getAnalyticsDoc(user.uid, period);
      const docSnapshot = await getDoc(analyticsDoc);

      if (!docSnapshot.exists()) {
        const initialData: UsageAnalytics = {
          period,
          usage: {
            totalResponses: 0,
            byRating: {
              '1': 0,
              '2': 0,
              '3': 0,
              '4': 0,
              '5': 0,
            },
            byMode: {
              individual: 0,
              bulkPositive: 0,
              bulkAll: 0,
            },
          },
          performance: {
            averageResponseTime: 0,
            successRate: 100,
            mostActiveDay: '',
            peakHour: 0,
          },
        };

        await setDoc(analyticsDoc, {
          ...initialData,
          createdAt: serverTimestamp() as Timestamp,
          updatedAt: serverTimestamp() as Timestamp,
        });

        console.log(`Initialized analytics for period: ${period}`);
      }
    } catch (error) {
      console.error('Error initializing analytics period:', error);
      throw new Error(`Failed to initialize analytics for period ${period}`);
    }
  }

  // Record a response generation event
  static async recordResponse(
    user: User,
    rating: 1 | 2 | 3 | 4 | 5,
    mode: 'individual' | 'bulkPositive' | 'bulkAll',
    responseTime: number,
    success: boolean = true,
    period: string = this.getCurrentPeriod()
  ): Promise<void> {
    try {
      // Ensure analytics document exists for this period
      await this.initializeAnalyticsPeriod(user, period);

      const analyticsDoc = this.getAnalyticsDoc(user.uid, period);
      const currentHour = new Date().getHours();
      const currentDay = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // Update analytics using Firestore field updates
      const updates: any = {
        'usage.totalResponses': increment(1),
        [`usage.byRating.${rating}`]: increment(1),
        [`usage.byMode.${mode}`]: increment(1),
        updatedAt: serverTimestamp() as Timestamp,
      };

      // Update performance metrics (requires reading current values)
      const docSnapshot = await getDoc(analyticsDoc);
      if (docSnapshot.exists()) {
        const currentData = docSnapshot.data() as any;
        const currentTotalResponses = currentData.usage?.totalResponses || 0;
        const currentAvgResponseTime = currentData.performance?.averageResponseTime || 0;
        const currentSuccessRate = currentData.performance?.successRate || 100;

        // Calculate new average response time
        const newAvgResponseTime = 
          (currentAvgResponseTime * currentTotalResponses + responseTime) / 
          (currentTotalResponses + 1);

        // Calculate new success rate
        const totalAttempts = currentTotalResponses + 1;
        const successfulAttempts = Math.round((currentSuccessRate / 100) * currentTotalResponses) + (success ? 1 : 0);
        const newSuccessRate = (successfulAttempts / totalAttempts) * 100;

        updates['performance.averageResponseTime'] = newAvgResponseTime;
        updates['performance.successRate'] = newSuccessRate;
        updates['performance.mostActiveDay'] = currentDay;
        updates['performance.peakHour'] = currentHour;
      }

      await updateDoc(analyticsDoc, updates);
      console.log(`Recorded response analytics: ${rating}-star ${mode} response`);
    } catch (error) {
      console.error('Error recording response analytics:', error);
      // Don't throw error to avoid breaking the main flow
    }
  }

  // Get analytics for a specific period
  static async getAnalyticsForPeriod(
    user: User,
    period: string = this.getCurrentPeriod()
  ): Promise<UsageAnalytics | null> {
    try {
      const analyticsDoc = this.getAnalyticsDoc(user.uid, period);
      const docSnapshot = await getDoc(analyticsDoc);

      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        return {
          period: data.period,
          usage: data.usage,
          performance: data.performance,
        };
      }

      return null;
    } catch (error) {
      console.error('Error getting analytics for period:', error);
      return null;
    }
  }

  // Get analytics for multiple periods
  static async getAnalyticsHistory(
    user: User,
    limitCount: number = 12
  ): Promise<UsageAnalytics[]> {
    try {
      const analyticsCollection = this.getAnalyticsCollection(user.uid);
      
      const analyticsQuery = query(
        analyticsCollection,
        orderBy('period', 'desc'),
        limit(limitCount)
      );

      const querySnapshot = await getDocs(analyticsQuery);
      const analytics: UsageAnalytics[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        analytics.push({
          period: data.period,
          usage: data.usage,
          performance: data.performance,
        });
      });

      return analytics;
    } catch (error) {
      console.error('Error getting analytics history:', error);
      return [];
    }
  }

  // Get comprehensive usage report combining analytics and transactions
  static async getUsageReport(
    user: User,
    period: string = this.getCurrentPeriod()
  ): Promise<{
    analytics: UsageAnalytics | null;
    creditUsage: {
      totalUsage: number;
      totalAllocated: number;
      transactionCount: number;
      breakdown: Record<string, number>;
    };
    efficiency: {
      creditsPerResponse: number;
      responseSuccessRate: number;
      peakUsageDay: string;
      recommendedPlan: string;
    };
  }> {
    try {
      // Get analytics data
      const analytics = await this.getAnalyticsForPeriod(user, period);

      // Get credit transaction data for the period
      const [year, month] = period.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      
      const creditUsage = await CreditTransactionService.calculateUsageForPeriod(
        user, 
        startDate, 
        endDate
      );

      // Calculate efficiency metrics
      const totalResponses = analytics?.usage.totalResponses || 0;
      const creditsPerResponse = totalResponses > 0 ? creditUsage.totalUsage / totalResponses : 0;
      const responseSuccessRate = analytics?.performance.successRate || 0;
      const peakUsageDay = analytics?.performance.mostActiveDay || '';
      
      // Recommend plan based on usage
      let recommendedPlan = 'free';
      if (creditUsage.totalUsage > 200) {
        recommendedPlan = 'professional';
      } else if (creditUsage.totalUsage > 50) {
        recommendedPlan = 'starter';
      }

      return {
        analytics,
        creditUsage,
        efficiency: {
          creditsPerResponse,
          responseSuccessRate,
          peakUsageDay,
          recommendedPlan,
        },
      };
    } catch (error) {
      console.error('Error generating usage report:', error);
      throw new Error('Failed to generate usage report');
    }
  }

  // Generate insights and recommendations
  static async generateInsights(user: User): Promise<{
    insights: string[];
    recommendations: string[];
    trends: {
      usage: 'increasing' | 'decreasing' | 'stable';
      efficiency: 'improving' | 'declining' | 'stable';
      engagement: 'high' | 'medium' | 'low';
    };
  }> {
    try {
      const history = await this.getAnalyticsHistory(user, 3);
      const insights: string[] = [];
      const recommendations: string[] = [];

      if (history.length >= 2) {
        const current = history[0];
        const previous = history[1];

        // Usage trend analysis
        const usageChange = ((current.usage.totalResponses - previous.usage.totalResponses) / 
                            Math.max(previous.usage.totalResponses, 1)) * 100;
        
        if (usageChange > 20) {
          insights.push(`Your usage increased by ${usageChange.toFixed(1)}% this month`);
          recommendations.push('Consider upgrading to a higher plan for better value');
        } else if (usageChange < -20) {
          insights.push(`Your usage decreased by ${Math.abs(usageChange).toFixed(1)}% this month`);
          recommendations.push('You might benefit from a lower plan to save costs');
        }

        // Performance analysis
        const performanceChange = current.performance.successRate - previous.performance.successRate;
        if (performanceChange > 5) {
          insights.push('Your response success rate has improved significantly');
        } else if (performanceChange < -5) {
          insights.push('Your response success rate has declined');
          recommendations.push('Check your prompts and review the AI responses quality');
        }

        // Rating distribution analysis
        const highRatings = current.usage.byRating['4'] + current.usage.byRating['5'];
        const totalRatings = Object.values(current.usage.byRating).reduce((a, b) => a + b, 0);
        const highRatingPercent = totalRatings > 0 ? (highRatings / totalRatings) * 100 : 0;

        if (highRatingPercent > 70) {
          insights.push('Most of your reviews are high-rated (4-5 stars)');
          recommendations.push('Focus on bulk processing for efficiency');
        } else if (highRatingPercent < 30) {
          insights.push('You have many low-rated reviews to respond to');
          recommendations.push('Consider using custom prompts to improve response quality');
        }
      }

      // Determine trends
      let usageTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      let efficiencyTrend: 'improving' | 'declining' | 'stable' = 'stable';
      let engagementLevel: 'high' | 'medium' | 'low' = 'medium';

      if (history.length >= 2) {
        const current = history[0];
        const previous = history[1];

        // Usage trend
        const usageChange = current.usage.totalResponses - previous.usage.totalResponses;
        if (usageChange > 5) usageTrend = 'increasing';
        else if (usageChange < -5) usageTrend = 'decreasing';

        // Efficiency trend (based on success rate)
        const efficiencyChange = current.performance.successRate - previous.performance.successRate;
        if (efficiencyChange > 2) efficiencyTrend = 'improving';
        else if (efficiencyChange < -2) efficiencyTrend = 'declining';

        // Engagement level
        if (current.usage.totalResponses > 50) engagementLevel = 'high';
        else if (current.usage.totalResponses < 10) engagementLevel = 'low';
      }

      return {
        insights,
        recommendations,
        trends: {
          usage: usageTrend,
          efficiency: efficiencyTrend,
          engagement: engagementLevel,
        },
      };
    } catch (error) {
      console.error('Error generating insights:', error);
      return {
        insights: [],
        recommendations: [],
        trends: {
          usage: 'stable',
          efficiency: 'stable',
          engagement: 'medium',
        },
      };
    }
  }

  // Export analytics data for external analysis
  static async exportAnalyticsData(
    user: User,
    startPeriod: string,
    endPeriod: string
  ): Promise<{
    analytics: UsageAnalytics[];
    summary: {
      totalPeriods: number;
      totalResponses: number;
      averageSuccessRate: number;
      mostUsedMode: string;
      averageRating: number;
    };
  }> {
    try {
      const analyticsCollection = this.getAnalyticsCollection(user.uid);
      
      const analyticsQuery = query(
        analyticsCollection,
        where('period', '>=', startPeriod),
        where('period', '<=', endPeriod),
        orderBy('period', 'asc')
      );

      const querySnapshot = await getDocs(analyticsQuery);
      const analytics: UsageAnalytics[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        analytics.push({
          period: data.period,
          usage: data.usage,
          performance: data.performance,
        });
      });

      // Calculate summary statistics
      let totalResponses = 0;
      let totalSuccessRate = 0;
      let totalRatingSum = 0;
      let totalRatingCount = 0;
      const modeUsage = { individual: 0, bulkPositive: 0, bulkAll: 0 };

      analytics.forEach((period) => {
        totalResponses += period.usage.totalResponses;
        totalSuccessRate += period.performance.successRate;
        
        // Calculate weighted average rating
        Object.entries(period.usage.byRating).forEach(([rating, count]) => {
          totalRatingSum += parseInt(rating) * count;
          totalRatingCount += count;
        });

        // Sum mode usage
        Object.entries(period.usage.byMode).forEach(([mode, count]) => {
          modeUsage[mode as keyof typeof modeUsage] += count;
        });
      });

      const averageSuccessRate = analytics.length > 0 ? totalSuccessRate / analytics.length : 0;
      const averageRating = totalRatingCount > 0 ? totalRatingSum / totalRatingCount : 0;
      const mostUsedMode = Object.entries(modeUsage).reduce((a, b) => 
        modeUsage[a[0] as keyof typeof modeUsage] > modeUsage[b[0] as keyof typeof modeUsage] ? a : b
      )[0];

      return {
        analytics,
        summary: {
          totalPeriods: analytics.length,
          totalResponses,
          averageSuccessRate,
          mostUsedMode,
          averageRating,
        },
      };
    } catch (error) {
      console.error('Error exporting analytics data:', error);
      throw new Error('Failed to export analytics data');
    }
  }
} 