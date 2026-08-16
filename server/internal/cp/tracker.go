package cp

import (
	"context"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awscfg "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/location"
	"github.com/aws/aws-sdk-go-v2/service/location/types"
)

// TrackerClient wraps the AWS Location Service Tracker API.
type TrackerClient struct {
	client      *location.Client
	trackerName string
}

// NewTrackerClient creates a TrackerClient.
// Returns nil if trackerName is empty (graceful degradation when AWS is not configured).
func NewTrackerClient(trackerName, region string) (*TrackerClient, error) {
	if trackerName == "" {
		return nil, nil
	}
	cfg, err := awscfg.LoadDefaultConfig(context.Background(),
		awscfg.WithRegion(region),
	)
	if err != nil {
		return nil, fmt.Errorf("aws config: %w", err)
	}
	return &TrackerClient{
		client:      location.NewFromConfig(cfg),
		trackerName: trackerName,
	}, nil
}

// UpdatePosition sends a single position update to the Tracker.
// Intended to be called from a goroutine (fire-and-forget).
func (t *TrackerClient) UpdatePosition(ctx context.Context, deviceID string, lat, lon float64) error {
	if t == nil {
		return nil
	}
	_, err := t.client.BatchUpdateDevicePosition(ctx, &location.BatchUpdateDevicePositionInput{
		TrackerName: aws.String(t.trackerName),
		Updates: []types.DevicePositionUpdate{{
			DeviceId:   aws.String(deviceID),
			Position:   []float64{lon, lat}, // GeoJSON order: [longitude, latitude]
			SampleTime: aws.Time(time.Now()),
		}},
	})
	return err
}

// GetHistory retrieves the full position history from the Tracker, handling pagination.
func (t *TrackerClient) GetHistory(ctx context.Context, deviceID string, from, to time.Time) ([]Position, error) {
	if t == nil {
		return nil, fmt.Errorf("tracker not configured")
	}

	var positions []Position
	var nextToken *string

	for {
		input := &location.GetDevicePositionHistoryInput{
			TrackerName:        aws.String(t.trackerName),
			DeviceId:           aws.String(deviceID),
			StartTimeInclusive: aws.Time(from),
			EndTimeExclusive:   aws.Time(to),
		}
		if nextToken != nil {
			input.NextToken = nextToken
		}

		out, err := t.client.GetDevicePositionHistory(ctx, input)
		if err != nil {
			return nil, err
		}

		for _, dp := range out.DevicePositions {
			if len(dp.Position) >= 2 {
				positions = append(positions, Position{
					Lat: dp.Position[1], // [lon, lat] -> Lat = index 1
					Lon: dp.Position[0],
				})
			}
		}

		if out.NextToken == nil || *out.NextToken == "" {
			break
		}
		nextToken = out.NextToken
	}

	return positions, nil
}
