import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as cdk8s from 'cdk8s';
import { KubeDeployment, KubeService, IntOrString } from '../imports/k8s';


//we want to pass the image URL to the graph as it's dynamic and depends on where the image is pushed to during runtime
export interface SockJsProps {
  readonly image: string;
}

//create the stack
//this stack creates a EKS cluster with the ALB controller, builds and deploys a SockJS demo application to showcase stickiness support
export class SockjsStickyCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    //create an EKS cluster (Includes VPC/subnets,...) with a fargate profile
    const cluster = new eks.FargateCluster(this, 'SockJsSticky', {
      version: eks.KubernetesVersion.V1_21,
      albController: {
        version: eks.AlbControllerVersion.V2_3_1,
      },
    
    });

    //build the docker image and push it to ECR
    //TODO

    //create the chart containing our Kubernetes definitions
    const sockJsChart = new SockJsChart(new cdk8s.App(), 'sockJS', { image: '832256313046.dkr.ecr.eu-west-1.amazonaws.com/sockjs:v5' });

    // add the cdk8s chart to the cluster
    cluster.addCdk8sChart('sockJS', sockJsChart);
  }
}
//cdk8s chart definition
class SockJsChart extends cdk8s.Chart {
  constructor(scope: Construct, id: string, props: SockJsProps) {
    super(scope, id);

    //specify the labels and namespace
    const label = { app: 'sockjs' };
    const namespace = { name: 'default' };    
  
    //define the service
    //important here are the annotation as they enable the stickiness on the loadbalancer
    new KubeService(this, 'service', {
      spec: {
        type: 'LoadBalancer',
        ports: [ { port: 80, targetPort: IntOrString.fromNumber(9999) } ],
        selector: label,
      },
      metadata: { 
        namespace: namespace.name, 
        annotations:{
          'service.beta.kubernetes.io/aws-load-balancer-type': 'external',
          'service.beta.kubernetes.io/aws-load-balancer-nlb-target-type': 'ip',
          'service.beta.kubernetes.io/aws-load-balancer-scheme': 'internet-facing',
          'service.beta.kubernetes.io/aws-load-balancer-target-group-attributes': 'stickiness.enabled=true,stickiness.type=source_ip',
          'service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled': 'true'
        } 
      }
    });

    //create the deployment
    new KubeDeployment(this, 'deployment', {
      metadata: { 
        namespace: namespace.name
      },
      spec: {
        replicas: 5,
        selector: {
          matchLabels: label
        },
        template: {
          metadata: { labels: label },
          spec: {
            containers: [
              {
                name: 'sockjs',
                image: props.image,
                ports: [ { containerPort: 9999 } ]
              }
            ]
          }
        }
      }
    });
  }
}