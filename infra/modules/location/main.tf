resource "aws_location_tracker" "this" {
  tracker_name = var.tracker_name

  position_filtering = "AccuracyBased"
}

resource "aws_location_map" "this" {
  map_name = var.map_name

  configuration {
    style = "VectorEsriNavigation"
  }
}